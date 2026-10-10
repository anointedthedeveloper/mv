export interface ApiResult {
  ok: boolean;
  status: number;
  ms: number;
  url: string;
  data: unknown;
  error?: string;
}

/** Calls the backend and never throws: failures come back as { ok: false, error }. */
export async function call(base: string, path: string, signal?: AbortSignal): Promise<ApiResult> {
  const url = base.replace(/\/+$/, '') + path;
  const start = performance.now();
  try {
    const res = await fetch(url, { signal });
    const text = await res.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* non-JSON body */ }
    const ms = Math.round(performance.now() - start);
    if (res.ok) return { ok: true, status: res.status, ms, url, data };
    const e = (data as { error?: { code?: string; message?: string } })?.error;
    return { ok: false, status: res.status, ms, url, data, error: e ? `${e.code}: ${e.message}` : `HTTP ${res.status}` };
  } catch (e) {
    if (signal?.aborted) throw e;
    return {
      ok: false, status: 0, ms: Math.round(performance.now() - start), url, data: null,
      error: `Network error: ${e instanceof Error ? e.message : String(e)} (is the backend running and CORS allowing this origin?)`,
    };
  }
}

export interface Title {
  id: string; type: 'movie' | 'tv'; title: string; overview: string | null;
  releaseDate: string | null; rating: number | null; poster: string | null;
}
export interface DownloadFile { file: string; label: string; license: string | null; sizeBytes: number; url: string }

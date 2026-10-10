import { useEffect, useRef, useState } from 'react';
import { call, type ApiResult, type DownloadFile, type Title } from './api';

const DEFAULT_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const fmtSize = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.ceil(n / 1e3)} KB`);

export function App() {
  const [base, setBase] = useState(() => localStorage.getItem('apiBase') ?? DEFAULT_BASE);
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloads, setDownloads] = useState<{ id: string; res: ApiResult } | null>(null);
  const [seasons, setSeasons] = useState('1');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { localStorage.setItem('apiBase', base); }, [base]);

  async function run(path: string) {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setLoading(true);
    try {
      setResult(await call(base, path, ctl.signal));
    } catch { /* superseded by a newer request */ }
    if (abort.current === ctl) setLoading(false);
  }

  const search = (p = 1) => { setPage(p); return run(`/api/search?q=${encodeURIComponent(q)}&type=${type}&page=${p}`); };
  const details = (t: Title) => run(`/api/${t.type === 'movie' ? 'movies' : 'tv'}/${encodeURIComponent(t.id)}`);
  const key = (t: Title) => `${t.type}-${t.id}`;
  async function loadDownloads(t: Title) {
    setDownloads({ id: key(t), res: await call(base, `/api/downloads/${encodeURIComponent(key(t))}`) });
  }

  const data = result?.data as { results?: Title[]; page?: number; totalPages?: number } | undefined;
  const results = result?.ok && Array.isArray(data?.results) ? data.results : [];

  return (
    <main>
      <h1>API Dashboard</h1>
      <section className="row">
        <label>API base URL <input value={base} onChange={(e) => setBase(e.target.value)} size={32} /></label>
        <button onClick={() => run('/health')}>Health</button>
        <a href={`${base.replace(/\/+$/, '')}/docs`} target="_blank" rel="noreferrer">OpenAPI docs</a>
      </section>

      <form className="row" onSubmit={(e) => { e.preventDefault(); if (q.trim()) search(1); }}>
        <input placeholder="Search titles…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All</option><option value="movie">Movies</option><option value="tv">TV</option>
        </select>
        <button type="submit" disabled={!q.trim() || loading}>Search</button>
        <button type="button" onClick={() => run(`/api/trending?type=${type}`)}>Trending</button>
        <button type="button" onClick={() => run(`/api/genres?type=${type === 'tv' ? 'tv' : 'movie'}`)}>Genres</button>
      </form>

      {loading && <p className="muted">Loading…</p>}
      {result && !result.ok && (
        <div className="error" role="alert">
          <strong>Request failed{result.status ? ` (${result.status})` : ''}:</strong> {result.error}
        </div>
      )}

      {results.length > 0 && (
        <>
          <ul className="results">
            {results.map((t) => (
              <li key={key(t)}>
                {t.poster ? <img src={t.poster} alt="" width={46} /> : <div className="noposter" />}
                <div className="meta">
                  <strong>{t.title}</strong>
                  <span className="muted">{t.type.toUpperCase()} · {t.releaseDate?.slice(0, 4) ?? '—'} · ★ {t.rating ?? '—'} · id {t.id}</span>
                </div>
                <button onClick={() => details(t)}>Details</button>
                <button onClick={() => loadDownloads(t)}>Downloads</button>
                {t.type === 'tv' && <button onClick={() => run(`/api/tv/${t.id}/seasons/1`)}>Season 1</button>}
              </li>
            ))}
          </ul>
          {data?.totalPages && data.totalPages > 1 && (
            <div className="row">
              <button disabled={page <= 1 || loading} onClick={() => search(page - 1)}>Prev</button>
              <span>Page {data.page} / {data.totalPages}</span>
              <button disabled={page >= data.totalPages || loading} onClick={() => search(page + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {downloads && (
        <section>
          <h2>Authorized downloads — {downloads.id}</h2>
          {!downloads.res.ok ? (
            <div className="error" role="alert">{downloads.res.error}</div>
          ) : (
            <ul className="results">
              {(downloads.res.data as { files: DownloadFile[] }).files.map((f) => (
                <li key={f.file}>
                  <div className="meta"><strong>{f.label}</strong>
                    <span className="muted">{fmtSize(f.sizeBytes)}{f.license ? ` · ${f.license}` : ''}</span></div>
                  <a className="btn" href={f.url} download>Download</a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {result?.ok && typeof data === 'object' && (data as { seasons?: unknown }).seasons !== undefined && (
        <div className="row">
          <label>Export seasons (metadata zip) <input value={seasons} onChange={(e) => setSeasons(e.target.value)} size={8} /></label>
          <a className="btn" href={`${base.replace(/\/+$/, '')}/api/tv/${(data as unknown as Title).id}/export?seasons=${encodeURIComponent(seasons)}`}>Download zip</a>
        </div>
      )}

      {result && (
        <section>
          <h2>Raw response <span className="muted">{result.status || 'no response'} · {result.ms} ms</span></h2>
          <code className="muted">GET {result.url}</code>
          <pre>{typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}

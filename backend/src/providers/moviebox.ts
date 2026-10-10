import { createHash, createHmac } from 'node:crypto';
import * as https from 'node:https';
import { NotFoundError } from '../lib/errors.js';
import type {
  Genre, MediaType, MetadataProvider, MovieDetails, Page,
  SearchParams, SeasonDetails, StreamSource, TitleSummary, TvDetails,
} from '../types.js';

const BASE = 'https://apig.inmoviebox.com';
// Gateway secret is base64-decoded before use as HMAC key
const SECRET = Buffer.from('76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O', 'base64');
const GUEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjcwNjU5NDg0MTAyMTM4MTYyMzIsInV0cCI6MSwiZXhwIjoxNzkxNzMyMjMzLCJpYXQiOjE3ODM5NTU5MzN9.7iyEzTj4vWAbOF0oXwNnZ0p3Nc1QaO6K9eMiGFyVfGs';

let sessionToken = GUEST_TOKEN;

function clientToken(): string {
  const ts = String(Date.now());
  return `${ts},${createHash('md5').update(ts.split('').reverse().join('')).digest('hex')}`;
}

function trSignature(method: string, fullUrl: string, body: string, ts: number): string {
  const parsed = new URL(fullUrl);
  const params = [...parsed.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const qs = params.map(([k, v]) => `${k}=${v}`).join('&');
  const resource = qs ? `${parsed.pathname}?${qs}` : parsed.pathname;
  const bodyMd5 = body ? createHash('md5').update(body.slice(0, 102400)).digest('hex') : '';
  const contentLen = body ? String(body.length) : '';
  const canonical = [method.toUpperCase(), 'application/json', 'application/json;charset=UTF-8', contentLen, ts, bodyMd5, resource].join('\n');
  const sig = createHmac('md5', SECRET).update(canonical, 'utf8').digest('base64');
  return `${ts}|2|${sig}`;
}

function buildHeaders(method: string, fullUrl: string, body = ''): Record<string, string> {
  const ts = Date.now();
  const clientInfo = JSON.stringify({
    package_name: 'com.community.oneroom', version_name: '4.0.02',
    version_code: 50020126, os: 'android', os_version: '14',
    install_ch: 'ps', device_id: '868203051234567', install_store: 'ps',
    gaid: '', brand: 'Google', model: 'Pixel 6', system_language: 'en',
    net: 'wifi', region: 'IN', timezone: 'Asia/Kolkata', sp_code: '404',
  });
  return {
    'User-Agent': 'MovieBox/4.0.02 (Android 14; Pixel 6)',
    'Accept': 'application/json',
    'X-M-Version': '4.0.02',
    'X-Client-Token': clientToken(),
    'X-Client-Info': clientInfo,
    'X-Client-Status': '0',
    'X-Play-Mode': '2',
    'x-tr-signature': trSignature(method, fullUrl, body, ts),
    'Content-Type': 'application/json;charset=UTF-8',
    'Authorization': `Bearer ${sessionToken}`,
    'appid': '4U01pxRu278GqCZKY9',
    'region': 'IN',
    'lang': 'en',
    'os': 'android',
    'X-Timestamp': String(ts),
    'Connection': 'close',
  };
}

function httpsGet(url: string, headers: Record<string, string>): Promise<string> {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request({ method: 'GET', hostname: u.hostname, path: u.pathname + u.search, headers, agent: false }, (res) => {
      let d = ''; res.on('data', (c: Buffer) => { d += c; }); res.on('end', () => resolve(d));
    });
    req.on('error', reject); req.end();
  });
}

async function apiH5<T>(method: 'GET', path: string): Promise<T> {
  const url = `https://h5-api.aoneroom.com${path}`;
  const raw = await httpsGet(url, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': 'https://moviebox.ph/',
    'Origin': 'https://moviebox.ph',
    'X-Client-Info': '{"timezone":"Asia/Kolkata"}',
    'X-Request-Lang': 'en',
    'Connection': 'close',
  });
  const json: { code: number; data?: T } = JSON.parse(raw);
  if (json.code !== 0) throw new Error(`H5 API error ${json.code}`);
  return json.data as T;
}

function httpsRequest(method: string, path: string, body?: string): Promise<string> {
  const fullUrl = `${BASE}${path}`;
  const headers = buildHeaders(method, fullUrl, body ?? '');
  const url = new URL(fullUrl);
  return new Promise((resolve, reject) => {
    const req = https.request({
      method, hostname: url.hostname,
      path: url.pathname + url.search,
      headers, agent: false,
    }, (res) => {
      const xu = res.headers['x-user'];
      if (xu) {
        try {
          const parsed = JSON.parse(Array.isArray(xu) ? xu[0] : xu);
          if (parsed?.token) sessionToken = parsed.token;
        } catch { /* ignore */ }
      }
      let data = '';
      res.on('data', (c: Buffer) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
  const bodyStr = body ? JSON.stringify(body) : '';
  // include host param as the working client does
  const sep = path.includes('?') ? '&' : '?';
  const fullPath = `${path}${sep}host=${new URL(BASE).hostname}`;
  const raw = await httpsRequest(method, fullPath, bodyStr || undefined);
  console.log('[moviebox]', method, path, raw.slice(0, 200));
  let json: { code: number; data?: T; message?: string; msg?: string };
  try { json = JSON.parse(raw); } catch { throw new Error(`Non-JSON: ${raw.slice(0, 100)}`); }
  if (json.code !== 0) throw new Error(json.message ?? json.msg ?? `API error ${json.code}`);
  return json.data as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSummary(r: any): TitleSummary {
  return {
    id: String(r.subjectId ?? r.id),
    type: r.subjectType === 1 || r.subjectType === 74 ? 'movie' : 'tv',
    title: r.title ?? r.name ?? '',
    overview: r.description ?? r.introduction ?? null,
    releaseDate: r.releaseDate ?? r.releaseTime ?? null,
    rating: r.imdbRatingValue != null ? Number(r.imdbRatingValue) : (r.score != null ? Number(r.score) : null),
    poster: r.cover?.url ?? r.poster ?? null,
    backdrop: r.preVideoCover?.url ?? r.backdrop?.url ?? null,
    genreIds: [],
  };
}

function mapCast(staffList: any[]): { name: string; character: string | null; photo: string | null }[] {
  const seen = new Set<string>();
  return (staffList ?? []).filter((c: any) => {
    if (c.staffType !== 1) return false;
    if (seen.has(c.staffId)) return false;
    seen.add(c.staffId);
    return true;
  }).map((c: any) => ({ name: c.name ?? '', character: c.character || null, photo: c.avatarUrl || null }));
}

export class MovieBoxProvider implements MetadataProvider {
  readonly name = 'moviebox';

  async search({ query, type, page }: SearchParams): Promise<Page<TitleSummary>> {
    const typeCode = type === 'movie' ? 1 : type === 'tv' ? 2 : 0;
    const data = await api<any>('POST', '/wefeed-mobile-bff/subject-api/search/v2', { keyword: query, type: typeCode, page, pageSize: 20 });
    // response: { results: [{ topicType, subjects: [...] }], pager: {...} }
    const raw: any[] = data.results ?? data.list ?? data.items ?? [];
    const items: any[] = raw.flatMap((r: any) => r.subjects ?? r.subject ?? [r]).filter(Boolean);
    const pager = data.pager ?? {};
    const total = Number(pager.totalCount) || items.length;
    const perPage = Number(pager.perPage) || 20;
    const seen = new Set<string>();
    const unique = items.filter((r: any) => {
      const sid = String(r.subjectId ?? r.id);
      if (seen.has(sid)) return false;
      seen.add(sid);
      return true;
    });
    return {
      page,
      totalPages: Math.ceil(total / perPage) || 1,
      totalResults: total,
      results: unique.map(toSummary),
    };
  }

  async getMovie(id: string): Promise<MovieDetails> {
    const data = await api<any>('GET', `/wefeed-mobile-bff/subject-api/get?subjectId=${id}`);
    if (!data) throw new NotFoundError('Movie not found');
    return {
      ...toSummary(data), type: 'movie',
      tagline: data.tagline ?? null,
      status: data.endYear ? 'Ended' : data.status ?? null,
      runtimeMinutes: data.duration ? Math.round(data.duration / 60) : null,
      genres: (data.genre ?? '').split(',').filter(Boolean).map((g: string, i: number) => ({ id: i, name: g.trim() })),
      cast: mapCast(data.staffList ?? data.cast),
    };
  }

  async getTv(id: string): Promise<TvDetails> {
    const data = await api<any>('GET', `/wefeed-mobile-bff/subject-api/get?subjectId=${id}`);
    if (!data) throw new NotFoundError('Series not found');
    const seasonData = await api<any>('GET', `/wefeed-mobile-bff/subject-api/season-info?subjectId=${id}`).catch(() => ({}));
    const seasons = (seasonData.seasons ?? seasonData.seasonList ?? []).map((s: any) => ({
      season: s.se ?? s.seasonNo ?? s.season,
      name: s.name ?? `Season ${s.se ?? s.seasonNo}`,
      episodeCount: s.maxEp ?? s.episodeCount ?? 0,
      airDate: s.releaseDate ?? s.releaseTime ?? null,
      poster: s.cover?.url ?? s.coverUrl ?? s.poster ?? null,
    }));
    return {
      ...toSummary(data), type: 'tv',
      tagline: data.tagline ?? null,
      status: data.endYear ? 'Ended' : data.status ?? null,
      genres: (data.genre ?? '').split(',').filter(Boolean).map((g: string, i: number) => ({ id: i, name: g.trim() })),
      cast: mapCast(data.staffList ?? data.cast),
      numberOfSeasons: seasons.length,
      numberOfEpisodes: seasons.reduce((n: number, s: any) => n + s.episodeCount, 0),
      seasons,
    };
  }

  async getSeason(tvId: string, season: number): Promise<SeasonDetails> {
    const data = await api<any>('GET', `/wefeed-mobile-bff/subject-api/episode-list?subjectId=${tvId}&se=${season}&page=1&pageSize=100`);
    const episodes = (data.episodeList ?? data.epList ?? data.list ?? []).map((e: any) => ({
      episode: e.episode ?? e.ep,
      name: e.name ?? `Episode ${e.episode}`,
      overview: e.description ?? null, airDate: e.releaseDate ?? null,
      runtimeMinutes: e.duration ? Math.round(e.duration / 60) : null,
      rating: e.score != null ? Number(e.score) : null,
      still: e.still?.url ?? null,
    }));
    return { season, name: `Season ${season}`, overview: null, airDate: null, episodes };
  }

  async trending(type: MediaType | 'all', page: number): Promise<Page<TitleSummary>> {
    const typeCode = type === 'movie' ? 1 : type === 'tv' ? 2 : 0;
    const data = await api<any>('POST', '/wefeed-mobile-bff/subject-api/trending/v2', { type: typeCode, page, pageSize: 20 });
    // response: { items: [{ type, subject: {...} }], pager: {...} }
    const raw: any[] = data.items ?? data.list ?? [];
    const items: any[] = raw.map((r: any) => r.subject ?? r).filter(Boolean);
    const pager = data.pager ?? {};
    const total = Number(pager.totalCount) || items.length;
    const perPage = Number(pager.perPage) || 20;
    return {
      page,
      totalPages: pager.hasMore ? page + 1 : page,
      totalResults: total || items.length,
      results: items.map(toSummary),
    };
  }

  async getStreams(id: string, type: MediaType, season = 1, episode = 1): Promise<StreamSource[]> {
    const data = await api<any>('GET', `/wefeed-mobile-bff/subject-api/get?subjectId=${id}`);
    if (!data) return [];
    const detailPath: string = data.detailPath ?? '';
    // Try the h5 player API for real streams
    if (detailPath) {
      try {
        const playData = await apiH5<any>('GET', `/wefeed-h5api-bff/subject/play?subjectId=${id}&se=${season}&ep=${episode}&detailPath=${encodeURIComponent(detailPath)}`);
        const streams: any[] = playData?.streams ?? [];
        if (streams.length) {
          return streams.map((s: any) => ({
            label: s.resolutions ? `${s.resolutions}p` : s.definition ?? 'Unknown',
            url: s.url,
            definition: s.format ?? s.definition ?? '',
            sizeBytes: s.size ?? 0,
            durationSeconds: s.duration ?? 0,
          }));
        }
      } catch { /* fall through to trailer */ }
    }
    // Fallback: return trailer preview
    const sources: any[] = data.preVideoAddress ?? [];
    return sources.map((s: any) => ({
      label: `Trailer ${s.definition === 'hd' ? '720p' : '480p'}`,
      url: s.url,
      definition: s.definition ?? '',
      sizeBytes: s.size ?? 0,
      durationSeconds: s.duration ?? 0,
    }));
  }

  async genres(type: MediaType): Promise<Genre[]> {
    const data = await api<any>('GET', `/wefeed-mobile-bff/subject-api/filter-items?type=${type === 'movie' ? 1 : 2}`);
    // response: { typeList: [{ subjectType, items: [{ filterType, filterVals: [...] }] }] }
    const typeEntry = (data.typeList ?? [data])[0] ?? {};
    const filterItems: any[] = typeEntry.items ?? data.filterItems ?? [];
    const genreFilter = filterItems.find((f: any) => f.filterType === 'genre' || f.name === 'Genre');
    const vals: any[] = genreFilter?.filterVals ?? genreFilter?.items ?? [];
    return vals.filter((g: any) => g !== 'All').map((g: any, i: number) => ({ id: i, name: g.name ?? g }));
  }
}

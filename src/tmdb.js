const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

const ttl = (Number(process.env.CACHE_TTL_SECONDS) || 300) * 1000;
const cache = new Map();

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const img = (path, size = 'w500') => (path ? `${IMG}/${size}${path}` : null);

async function get(path, params = {}) {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new HttpError(500, 'TMDB_API_KEY is not set');

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, v);
  }
  const cacheKey = url.toString();
  const hit = cache.get(cacheKey);
  if (hit && hit.exp > Date.now()) return hit.data;

  // v4 read tokens (JWT) go in a header, v3 keys go in the query string
  const headers = { accept: 'application/json' };
  if (key.length > 40) headers.authorization = `Bearer ${key}`;
  else url.searchParams.set('api_key', key);

  const res = await fetch(url, { headers });
  if (res.status === 404) throw new HttpError(404, 'Not found');
  if (!res.ok) throw new HttpError(502, `TMDB error ${res.status}`);
  const data = await res.json();
  cache.set(cacheKey, { data, exp: Date.now() + ttl });
  if (cache.size > 1000) cache.delete(cache.keys().next().value);
  return data;
}

const summary = (r, type) => ({
  id: r.id,
  type: r.media_type || type,
  title: r.title || r.name,
  overview: r.overview,
  releaseDate: r.release_date || r.first_air_date || null,
  rating: r.vote_average,
  poster: img(r.poster_path),
  backdrop: img(r.backdrop_path, 'w780'),
});

export async function search(q, { page = 1, type = 'multi' } = {}) {
  const endpoint = { multi: 'multi', movie: 'movie', tv: 'tv' }[type] || 'multi';
  const d = await get(`/search/${endpoint}`, { query: q, page });
  const results = d.results
    .filter((r) => endpoint !== 'multi' || r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => summary(r, endpoint));
  return { page: d.page, totalPages: d.total_pages, totalResults: d.total_results, results };
}

export async function details(type, id) {
  const d = await get(`/${type}/${id}`, { append_to_response: 'credits' });
  const base = {
    ...summary(d, type),
    tagline: d.tagline,
    status: d.status,
    genres: d.genres?.map((g) => g.name) ?? [],
    cast: (d.credits?.cast ?? []).slice(0, 15).map((c) => ({
      name: c.name,
      character: c.character,
      photo: img(c.profile_path, 'w185'),
    })),
  };
  if (type === 'movie') return { ...base, runtime: d.runtime };
  return {
    ...base,
    numberOfSeasons: d.number_of_seasons,
    numberOfEpisodes: d.number_of_episodes,
    seasons: d.seasons.map((s) => ({
      season: s.season_number,
      name: s.name,
      episodeCount: s.episode_count,
      airDate: s.air_date,
      poster: img(s.poster_path),
    })),
  };
}

export async function season(id, n) {
  const d = await get(`/tv/${id}/season/${n}`);
  return {
    season: d.season_number,
    name: d.name,
    overview: d.overview,
    airDate: d.air_date,
    episodes: d.episodes.map((e) => ({
      episode: e.episode_number,
      name: e.name,
      overview: e.overview,
      airDate: e.air_date,
      runtime: e.runtime,
      rating: e.vote_average,
      still: img(e.still_path, 'w300'),
    })),
  };
}

export const trending = async (type = 'all') => {
  const t = ['movie', 'tv'].includes(type) ? type : 'all';
  const d = await get(`/trending/${t}/week`);
  return d.results.map((r) => summary(r, t));
};

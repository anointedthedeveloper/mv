import { ConfigError, NotFoundError, UpstreamError } from '../lib/errors.js';
import type {
  CastMember, Genre, MediaType, MetadataProvider, MovieDetails, Page, SearchParams,
  SeasonDetails, TitleSummary, TvDetails,
} from '../types.js';

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
const img = (p: string | null | undefined, size = 'w500') => (p ? `${IMG}/${size}${p}` : null);

type J = Record<string, any>;

/** TMDB's documented API. Needs your own key; verified here only against mocked HTTP. */
export class TmdbProvider implements MetadataProvider {
  readonly name = 'tmdb';

  constructor(
    private apiKey: string | undefined,
    private timeoutMs = 8000,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async get(path: string, params: Record<string, string | number> = {}): Promise<J> {
    if (!this.apiKey) throw new ConfigError('TMDB_API_KEY is not set');
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.apiKey.length > 40) headers.authorization = `Bearer ${this.apiKey}`; // v4 token
    else url.searchParams.set('api_key', this.apiKey); // v3 key
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      throw new UpstreamError(timedOut ? 'TMDB request timed out' : 'TMDB is unreachable', timedOut ? 504 : 502);
    }
    if (res.status === 404) throw new NotFoundError();
    if (res.status === 401) throw new ConfigError('TMDB rejected the API key');
    if (!res.ok) throw new UpstreamError(`TMDB responded ${res.status}`);
    return (await res.json()) as J;
  }

  private summary(r: J, type: MediaType): TitleSummary {
    return {
      id: String(r.id), type, title: r.title ?? r.name ?? '', overview: r.overview || null,
      releaseDate: r.release_date || r.first_air_date || null, rating: r.vote_average ?? null,
      poster: img(r.poster_path), backdrop: img(r.backdrop_path, 'w780'),
      genreIds: r.genre_ids ?? r.genres?.map((g: J) => g.id) ?? [],
    };
  }

  private page(d: J, results: TitleSummary[]): Page<TitleSummary> {
    return { page: d.page, totalPages: d.total_pages, totalResults: d.total_results, results };
  }

  private cast(d: J): CastMember[] {
    return (d.credits?.cast ?? []).slice(0, 15).map((c: J) => ({
      name: c.name, character: c.character || null, photo: img(c.profile_path, 'w185'),
    }));
  }

  async search({ query, type, page }: SearchParams) {
    const d = await this.get(`/search/${type === 'all' ? 'multi' : type}`, { query, page });
    const results = (d.results as J[])
      .filter((r) => type !== 'all' || r.media_type === 'movie' || r.media_type === 'tv')
      .map((r) => this.summary(r, type === 'all' ? r.media_type : type));
    return this.page(d, results);
  }

  async getMovie(id: string): Promise<MovieDetails> {
    const d = await this.get(`/movie/${encodeURIComponent(id)}`, { append_to_response: 'credits' });
    return {
      ...this.summary(d, 'movie'), type: 'movie', tagline: d.tagline || null, status: d.status ?? null,
      runtimeMinutes: d.runtime ?? null, genres: d.genres ?? [], cast: this.cast(d),
    };
  }

  async getTv(id: string): Promise<TvDetails> {
    const d = await this.get(`/tv/${encodeURIComponent(id)}`, { append_to_response: 'credits' });
    return {
      ...this.summary(d, 'tv'), type: 'tv', tagline: d.tagline || null, status: d.status ?? null,
      genres: d.genres ?? [], cast: this.cast(d),
      numberOfSeasons: d.number_of_seasons ?? 0, numberOfEpisodes: d.number_of_episodes ?? 0,
      seasons: (d.seasons ?? []).map((s: J) => ({
        season: s.season_number, name: s.name, episodeCount: s.episode_count,
        airDate: s.air_date ?? null, poster: img(s.poster_path),
      })),
    };
  }

  async getSeason(tvId: string, season: number): Promise<SeasonDetails> {
    const d = await this.get(`/tv/${encodeURIComponent(tvId)}/season/${season}`);
    return {
      season: d.season_number, name: d.name, overview: d.overview || null, airDate: d.air_date ?? null,
      episodes: (d.episodes ?? []).map((e: J) => ({
        episode: e.episode_number, name: e.name, overview: e.overview || null, airDate: e.air_date ?? null,
        runtimeMinutes: e.runtime ?? null, rating: e.vote_average ?? null, still: img(e.still_path, 'w300'),
      })),
    };
  }

  async trending(type: MediaType | 'all', page: number) {
    const d = await this.get(`/trending/${type}/week`, { page });
    return this.page(d, (d.results as J[]).map((r) => this.summary(r, type === 'all' ? r.media_type : type)));
  }

  async genres(type: MediaType): Promise<Genre[]> {
    return (await this.get(`/genre/${type}/list`)).genres as Genre[];
  }
}

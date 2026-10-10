import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NotFoundError } from '../lib/errors.js';
import type {
  Genre, MediaType, MetadataProvider, MovieDetails, Page, SearchParams, SeasonDetails,
  SeasonSummary, TitleSummary, TvDetails,
} from '../types.js';

const PAGE_SIZE = 20;

type RawSeason = SeasonSummary extends infer S ? Omit<S & SeasonDetails, 'episodeCount' | 'overview'> : never;
interface Raw extends Omit<TitleSummary, 'type'> {
  tagline: string | null; status: string | null; cast: MovieDetails['cast'];
  runtimeMinutes?: number; seasons?: RawSeason[];
}
interface Catalog { genres: Record<MediaType, Genre[]>; movies: Raw[]; tv: Raw[]; trending: string[] }

const paginate = <T>(items: T[], page: number): Page<T> => ({
  page, totalPages: Math.max(1, Math.ceil(items.length / PAGE_SIZE)), totalResults: items.length,
  results: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
});

/** Local sample catalog for offline development and tests. Not a live data source. */
export class FixturesProvider implements MetadataProvider {
  readonly name = 'fixtures';
  private c: Catalog;

  constructor(path = fileURLToPath(new URL('../../fixtures/catalog.json', import.meta.url))) {
    this.c = JSON.parse(readFileSync(path, 'utf8')) as Catalog;
  }

  private all(): TitleSummary[] {
    const s = (t: Raw, type: MediaType): TitleSummary => ({
      id: t.id, type, title: t.title, overview: t.overview, releaseDate: t.releaseDate,
      rating: t.rating, poster: t.poster, backdrop: t.backdrop, genreIds: t.genreIds,
    });
    return [...this.c.movies.map((m) => s(m, 'movie')), ...this.c.tv.map((t) => s(t, 'tv'))];
  }

  async search({ query, type, page }: SearchParams) {
    const q = query.toLowerCase();
    return paginate(
      this.all().filter((t) => (type === 'all' || t.type === type) && t.title.toLowerCase().includes(q)),
      page,
    );
  }

  async getMovie(id: string): Promise<MovieDetails> {
    const m = this.c.movies.find((x) => x.id === id);
    if (!m) throw new NotFoundError('Movie not found');
    return {
      id: m.id, type: 'movie', title: m.title, overview: m.overview, releaseDate: m.releaseDate,
      rating: m.rating, poster: m.poster, backdrop: m.backdrop, genreIds: m.genreIds,
      tagline: m.tagline, status: m.status, runtimeMinutes: m.runtimeMinutes ?? null,
      genres: this.c.genres.movie.filter((g) => m.genreIds.includes(g.id)), cast: m.cast,
    };
  }

  async getTv(id: string): Promise<TvDetails> {
    const t = this.c.tv.find((x) => x.id === id);
    if (!t) throw new NotFoundError('Series not found');
    const seasons = t.seasons ?? [];
    return {
      id: t.id, type: 'tv', title: t.title, overview: t.overview, releaseDate: t.releaseDate,
      rating: t.rating, poster: t.poster, backdrop: t.backdrop, genreIds: t.genreIds,
      tagline: t.tagline, status: t.status, cast: t.cast,
      genres: this.c.genres.tv.filter((g) => t.genreIds.includes(g.id)),
      numberOfSeasons: seasons.length,
      numberOfEpisodes: seasons.reduce((n, s) => n + s.episodes.length, 0),
      seasons: seasons.map((s) => ({
        season: s.season, name: s.name, episodeCount: s.episodes.length, airDate: s.airDate, poster: s.poster,
      })),
    };
  }

  async getSeason(tvId: string, season: number): Promise<SeasonDetails> {
    const s = this.c.tv.find((x) => x.id === tvId)?.seasons?.find((x) => x.season === season);
    if (!s) throw new NotFoundError('Season not found');
    return { season: s.season, name: s.name, overview: null, airDate: s.airDate, episodes: s.episodes };
  }

  async trending(type: MediaType | 'all', page: number) {
    const all = this.all();
    const ordered = this.c.trending
      .map((id) => all.find((t) => t.id === id))
      .filter((t): t is TitleSummary => !!t && (type === 'all' || t.type === type));
    return paginate(ordered, page);
  }

  async genres(type: MediaType) { return this.c.genres[type]; }
}

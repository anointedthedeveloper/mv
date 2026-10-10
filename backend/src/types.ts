export type MediaType = 'movie' | 'tv';

export interface Genre { id: number; name: string }

export interface TitleSummary {
  id: string;
  type: MediaType;
  title: string;
  overview: string | null;
  releaseDate: string | null;
  rating: number | null;
  poster: string | null;
  backdrop: string | null;
  genreIds: number[];
}

export interface CastMember { name: string; character: string | null; photo: string | null }

export interface MovieDetails extends TitleSummary {
  type: 'movie';
  tagline: string | null;
  status: string | null;
  runtimeMinutes: number | null;
  genres: Genre[];
  cast: CastMember[];
}

export interface SeasonSummary {
  season: number; name: string; episodeCount: number; airDate: string | null; poster: string | null;
}

export interface TvDetails extends TitleSummary {
  type: 'tv';
  tagline: string | null;
  status: string | null;
  genres: Genre[];
  cast: CastMember[];
  numberOfSeasons: number;
  numberOfEpisodes: number;
  seasons: SeasonSummary[];
}

export interface Episode {
  episode: number; name: string; overview: string | null; airDate: string | null;
  runtimeMinutes: number | null; rating: number | null; still: string | null;
}

export interface SeasonDetails {
  season: number; name: string; overview: string | null; airDate: string | null; episodes: Episode[];
}

export interface Page<T> { page: number; totalPages: number; totalResults: number; results: T[] }

export interface SearchParams { query: string; type: MediaType | 'all'; page: number }

export interface StreamSource { label: string; url: string; definition: string; sizeBytes: number; durationSeconds: number }

export interface MetadataProvider {
  readonly name: string;
  search(p: SearchParams): Promise<Page<TitleSummary>>;
  getMovie(id: string): Promise<MovieDetails>;
  getTv(id: string): Promise<TvDetails>;
  getSeason(tvId: string, season: number): Promise<SeasonDetails>;
  trending(type: MediaType | 'all', page: number): Promise<Page<TitleSummary>>;
  genres(type: MediaType): Promise<Genre[]>;
  getStreams?(id: string, type: MediaType, season?: number, episode?: number): Promise<StreamSource[]>;
}

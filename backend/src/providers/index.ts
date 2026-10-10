import type { Config } from '../config.js';
import type { MetadataProvider } from '../types.js';
import { FixturesProvider } from './fixtures.js';
import { TmdbProvider } from './tmdb.js';

export const createProvider = (cfg: Config): MetadataProvider =>
  cfg.PROVIDER === 'fixtures' ? new FixturesProvider() : new TmdbProvider(cfg.TMDB_API_KEY, cfg.UPSTREAM_TIMEOUT_MS);

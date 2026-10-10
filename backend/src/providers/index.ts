import type { MetadataProvider } from '../types.js';
import { FixturesProvider } from './fixtures.js';
import { MovieBoxProvider } from './moviebox.js';

export const createProvider = (): MetadataProvider => {
  if (process.env.PROVIDER === 'moviebox') return new MovieBoxProvider();
  return new FixturesProvider();
};

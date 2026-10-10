import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  PROVIDER: z.enum(['tmdb', 'fixtures']).default('tmdb'),
  TMDB_API_KEY: z.string().optional(),
  CORS_ORIGINS: z.string().default('*'),
  CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(300),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  DOWNLOADS_DIR: z.string().default('./media'),
  DOWNLOAD_SIGNING_SECRET: z.string().min(8).default('change-me'),
  DOWNLOAD_LINK_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),
});

export type Config = z.infer<typeof schema>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => schema.parse(env);

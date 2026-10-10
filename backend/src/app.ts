import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import type { Config } from './config.js';
import { Downloads } from './downloads.js';
import { exportSeasons } from './export.js';
import { TtlCache } from './lib/cache.js';
import { HttpError } from './lib/errors.js';
import { noopLogger, requestLogger, type Logger } from './lib/logger.js';
import { rateLimit } from './lib/rateLimit.js';
import { openapi } from './openapi.js';
import type { MetadataProvider } from './types.js';

const id = z.string().regex(/^[\w-]{1,40}$/, 'Invalid id');
const page = z.coerce.number().int().min(1).max(500).default(1);
const kind = z.enum(['movie', 'tv']);
const kindOrAll = z.enum(['all', 'movie', 'tv']).default('all');
const seasonNo = z.coerce.number().int().min(0).max(1000);

const parse = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; '), 'bad_request');
  return r.data;
};

export function createApp(cfg: Config, provider: MetadataProvider, log: Logger = noopLogger) {
  const app = express();
  const cache = new TtlCache<unknown>(cfg.CACHE_TTL_SECONDS * 1000);
  const cached = <T>(key: string, load: () => Promise<T>) => cache.wrap(`${provider.name}:${key}`, load) as Promise<T>;
  const downloads = new Downloads({
    dir: cfg.DOWNLOADS_DIR, secret: cfg.DOWNLOAD_SIGNING_SECRET,
    ttlSeconds: cfg.DOWNLOAD_LINK_TTL_SECONDS, publicBaseUrl: cfg.PUBLIC_BASE_URL,
  });

  app.disable('x-powered-by');
  app.use(requestLogger(log));
  app.use(cors({ origin: cfg.CORS_ORIGINS === '*' ? true : cfg.CORS_ORIGINS.split(',').map((s) => s.trim()) }));
  app.use(rateLimit(cfg.RATE_LIMIT_PER_MINUTE));

  const route = (fn: (req: express.Request) => Promise<unknown>): express.RequestHandler =>
    (req, res, next) => fn(req).then((d) => res.json(d), next);

  app.get('/health', (_req, res) => res.json({ ok: true, provider: provider.name }));
  app.get('/openapi.json', (_req, res) => res.json(openapi));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

  app.get('/api/search', route(async (req) => {
    const p = parse(z.object({ q: z.string().trim().min(1).max(100), type: kindOrAll, page }), req.query);
    return cached(`search:${p.q}:${p.type}:${p.page}`, () => provider.search({ query: p.q, type: p.type, page: p.page }));
  }));

  app.get('/api/trending', route(async (req) => {
    const p = parse(z.object({ type: kindOrAll, page }), req.query);
    return cached(`trending:${p.type}:${p.page}`, () => provider.trending(p.type, p.page));
  }));

  app.get('/api/genres', route(async (req) => {
    const p = parse(z.object({ type: kind.default('movie') }), req.query);
    return cached(`genres:${p.type}`, () => provider.genres(p.type));
  }));

  app.get('/api/movies/:id', route(async (req) => {
    const { id: i } = parse(z.object({ id }), req.params);
    return cached(`movie:${i}`, () => provider.getMovie(i));
  }));

  app.get('/api/tv/:id', route(async (req) => {
    const { id: i } = parse(z.object({ id }), req.params);
    return cached(`tv:${i}`, () => provider.getTv(i));
  }));

  app.get('/api/tv/:id/seasons/:season', route(async (req) => {
    const p = parse(z.object({ id, season: seasonNo }), req.params);
    return cached(`season:${p.id}:${p.season}`, () => provider.getSeason(p.id, p.season));
  }));

  app.get('/api/tv/:id/export', async (req, res, next) => {
    try {
      const p = parse(z.object({
        id,
        seasons: z.string().transform((s) => [...new Set(s.split(',').filter(Boolean).map(Number))])
          .pipe(z.array(z.number().int().min(0).max(1000)).min(1).max(50)),
      }), { ...req.params, ...req.query });
      await exportSeasons(res, provider, p.id, p.seasons);
    } catch (e) { next(e); }
  });

  app.get('/api/downloads/:id', route(async (req) => downloads.list(parse(z.object({ id }), req.params).id)));

  app.get('/api/downloads/:id/files/:file', (req, res, next) => {
    try {
      const p = parse(z.object({ id, file: z.string().min(1).max(255) }), req.params);
      const q = parse(z.object({ exp: z.string().optional(), sig: z.string().optional() }), req.query);
      const path = downloads.authorize(p.id, p.file, q.exp, q.sig);
      res.download(path, p.file, (err) => { if (err && !res.headersSent) next(err); });
    } catch (e) { next(e); }
  });

  app.use((_req, _res, next) => next(new HttpError(404, 'Route not found', 'not_found')));
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = typeof err?.status === 'number' ? err.status : 500;
    const code = err?.code && typeof err.code === 'string' ? err.code : 'error';
    if (status >= 500) log('error', 'request failed', { message: String(err?.message), code });
    if (res.headersSent) return res.destroy();
    res.status(status).json({ error: { code, message: status >= 500 && !(err instanceof HttpError) ? 'Internal server error' : err.message } });
  };
  app.use(onError);
  return app;
}

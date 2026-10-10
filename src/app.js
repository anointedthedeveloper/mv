import express from 'express';
import * as tmdb from './tmdb.js';

const wrap = (fn) => (req, res, next) => fn(req, res).then((d) => res.json(d)).catch(next);
const positiveInt = (v) => /^\d{1,9}$/.test(v) && Number(v) >= 0;

function rateLimit(perMinute) {
  const hits = new Map();
  setInterval(() => hits.clear(), 60_000).unref();
  return (req, res, next) => {
    const n = (hits.get(req.ip) || 0) + 1;
    hits.set(req.ip, n);
    if (n > perMinute) return res.status(429).json({ error: 'Too many requests' });
    next();
  };
}

export function createApp() {
  const app = express();
  app.use(rateLimit(Number(process.env.RATE_LIMIT_PER_MINUTE) || 60));

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.get('/search', wrap(async (req) => {
    const q = String(req.query.q || '').trim();
    if (!q) throw new tmdb.HttpError(400, 'Query param "q" is required');
    return tmdb.search(q, { page: req.query.page, type: req.query.type });
  }));

  app.get('/trending', wrap(async (req) => tmdb.trending(req.query.type)));

  app.get('/title/:type(movie|tv)/:id', wrap(async (req) => {
    if (!positiveInt(req.params.id)) throw new tmdb.HttpError(400, 'Invalid id');
    return tmdb.details(req.params.type, req.params.id);
  }));

  app.get('/title/tv/:id/seasons/:n', wrap(async (req) => {
    if (!positiveInt(req.params.id) || !positiveInt(req.params.n)) {
      throw new tmdb.HttpError(400, 'Invalid id or season');
    }
    return tmdb.season(req.params.id, req.params.n);
  }));

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
  });
  return app;
}

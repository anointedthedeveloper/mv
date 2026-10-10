import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { FixturesProvider } from '../src/providers/fixtures.js';
import { TmdbProvider } from '../src/providers/tmdb.js';

let dir: string;
const mk = (extra: Record<string, string> = {}) =>
  createApp(loadConfig({ DOWNLOADS_DIR: dir, DOWNLOAD_SIGNING_SECRET: 'test-secret-123', RATE_LIMIT_PER_MINUTE: '1000', ...extra }), new FixturesProvider());

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'dl-'));
  writeFileSync(join(dir, 'clip.txt'), 'hello owned file');
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    'movie-m1': [{ file: 'clip.txt', label: 'Clip', license: 'CC0' }, { file: 'missing.mp4' }],
    'movie-evil': [{ file: '../secret.txt' }],
  }));
});

describe('metadata routes', () => {
  const app = mk();
  it('searches', async () => {
    const r = await request(app).get('/api/search?q=sample');
    expect(r.status).toBe(200);
    expect(r.body.results[0].title).toBe('Sample Series');
  });
  it('validates input', async () => {
    expect((await request(app).get('/api/search')).status).toBe(400);
    expect((await request(app).get('/api/search?q=a&page=0')).status).toBe(400);
    expect((await request(app).get('/api/movies/a%20b')).status).toBe(400);
  });
  it('returns details, season, genres, trending', async () => {
    expect((await request(app).get('/api/movies/m1')).body.runtimeMinutes).toBe(112);
    expect((await request(app).get('/api/tv/t1')).body.numberOfEpisodes).toBe(2);
    expect((await request(app).get('/api/tv/t1/seasons/1')).body.episodes).toHaveLength(2);
    expect((await request(app).get('/api/genres?type=tv')).body).toHaveLength(2);
    expect((await request(app).get('/api/trending?type=movie')).body.results.map((t: any) => t.id)).toEqual(['m1', 'm2']);
  });
  it('404s with a consistent error shape', async () => {
    const r = await request(app).get('/api/movies/nope');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('not_found');
    expect((await request(app).get('/nothing')).status).toBe(404);
  });
  it('exports a metadata zip', async () => {
    const r = await request(app).get('/api/tv/t1/export?seasons=1').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/zip');
    expect((r.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    expect((await request(app).get('/api/tv/t1/export?seasons=x')).status).toBe(400);
  });
  it('serves OpenAPI', async () => {
    expect((await request(app).get('/openapi.json')).body.openapi).toBe('3.0.3');
  });
});

describe('rate limiting', () => {
  it('returns 429 past the limit', async () => {
    const app = mk({ RATE_LIMIT_PER_MINUTE: '2' });
    await request(app).get('/health');
    await request(app).get('/health');
    expect((await request(app).get('/health')).status).toBe(429);
  });
});

describe('authorized downloads', () => {
  let app: ReturnType<typeof mk>;
  beforeAll(() => { app = mk(); });
  it('lists signed links and serves the file', async () => {
    const list = await request(app).get('/api/downloads/movie-m1');
    expect(list.status).toBe(200);
    expect(list.body.files).toHaveLength(1); // missing.mp4 is skipped
    const url = new URL(list.body.files[0].url);
    const file = await request(app).get(url.pathname + url.search);
    expect(file.status).toBe(200);
    expect(file.text).toBe('hello owned file');
  });
  it('rejects tampered or missing signatures', async () => {
    const list = await request(app).get('/api/downloads/movie-m1');
    const u = new URL(list.body.files[0].url);
    expect((await request(app).get(u.pathname)).status).toBe(403);
    expect((await request(app).get(u.pathname + '?exp=1&sig=bad')).status).toBe(403);
    u.searchParams.set('sig', 'a'.repeat(64));
    expect((await request(app).get(u.pathname + u.search)).status).toBe(403);
  });
  it('404s unknown titles and contains traversal', async () => {
    expect((await request(app).get('/api/downloads/movie-zzz')).status).toBe(404);
    const evil = await request(app).get('/api/downloads/movie-evil');
    expect(evil.body.files).toEqual([]);
  });
});

describe('TmdbProvider (mocked HTTP)', () => {
  const resp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  it('normalizes search results and sends the key', async () => {
    const f = vi.fn().mockResolvedValue(resp({ page: 1, total_pages: 1, total_results: 1, results: [
      { id: 7, media_type: 'movie', title: 'X', overview: '', release_date: '2020-01-01', vote_average: 5, poster_path: '/p.jpg', genre_ids: [1] },
      { id: 8, media_type: 'person', name: 'Skip me' },
    ] }));
    const r = await new TmdbProvider('k', 1000, f as any).search({ query: 'x', type: 'all', page: 1 });
    expect(r.results).toEqual([expect.objectContaining({ id: '7', type: 'movie', overview: null, poster: 'https://image.tmdb.org/t/p/w500/p.jpg' })]);
    expect(String(f.mock.calls[0]![0])).toContain('api_key=k');
  });
  it('maps upstream failures to clear errors', async () => {
    const p = (s: number) => new TmdbProvider('k', 1000, vi.fn().mockResolvedValue(resp({}, s)) as any);
    await expect(p(404).getMovie('1')).rejects.toMatchObject({ status: 404 });
    await expect(p(401).getMovie('1')).rejects.toMatchObject({ code: 'not_configured' });
    await expect(p(500).getMovie('1')).rejects.toMatchObject({ status: 502 });
    const down = new TmdbProvider('k', 1000, vi.fn().mockRejectedValue(new Error('x')) as any);
    await expect(down.genres('movie')).rejects.toMatchObject({ code: 'upstream_error' });
    await expect(new TmdbProvider(undefined).genres('movie')).rejects.toMatchObject({ code: 'not_configured' });
  });
});

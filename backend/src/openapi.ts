const page = { type: 'object', properties: { page: { type: 'integer' }, totalPages: { type: 'integer' }, totalResults: { type: 'integer' }, results: { type: 'array', items: { $ref: '#/components/schemas/TitleSummary' } } } };
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
const q = (name: string, schema: object, required = false) => ({ name, in: 'query', required, schema });
const ok = (schema: object) => ({ '200': { description: 'OK', content: { 'application/json': { schema } } } });
const errs = { '400': { $ref: '#/components/responses/Error' }, '404': { $ref: '#/components/responses/Error' }, '502': { $ref: '#/components/responses/Error' } };

export const openapi = {
  openapi: '3.0.3',
  info: { title: 'MV Metadata API', version: '1.0.0', description: 'Movie/TV metadata (TMDB or offline fixtures) plus authorized downloads of files you own.' },
  paths: {
    '/health': { get: { summary: 'Health check', responses: ok({ type: 'object' }) } },
    '/api/search': { get: { summary: 'Search titles', parameters: [q('q', { type: 'string' }, true), q('type', { enum: ['all', 'movie', 'tv'] }), q('page', { type: 'integer', minimum: 1, maximum: 500 })], responses: { ...ok(page), ...errs } } },
    '/api/trending': { get: { summary: 'Trending this week', parameters: [q('type', { enum: ['all', 'movie', 'tv'] }), q('page', { type: 'integer' })], responses: { ...ok(page), ...errs } } },
    '/api/genres': { get: { summary: 'Genre list', parameters: [q('type', { enum: ['movie', 'tv'] })], responses: { ...ok({ type: 'array', items: { $ref: '#/components/schemas/Genre' } }), ...errs } } },
    '/api/movies/{id}': { get: { summary: 'Movie details', parameters: [idParam], responses: { ...ok({ type: 'object' }), ...errs } } },
    '/api/tv/{id}': { get: { summary: 'TV details with season list', parameters: [idParam], responses: { ...ok({ type: 'object' }), ...errs } } },
    '/api/tv/{id}/seasons/{season}': { get: { summary: 'Episodes of a season', parameters: [idParam, { name: 'season', in: 'path', required: true, schema: { type: 'integer' } }], responses: { ...ok({ type: 'object' }), ...errs } } },
    '/api/tv/{id}/export': { get: { summary: 'Zip of episode metadata (JSON + CSV)', parameters: [idParam, q('seasons', { type: 'string', example: '1,2' }, true)], responses: { '200': { description: 'application/zip' }, ...errs } } },
    '/api/downloads/{id}': { get: { summary: 'Authorized downloads for a title (id like movie-603 or tv-1396)', parameters: [idParam], responses: { ...ok({ type: 'object' }), ...errs } } },
    '/api/downloads/{id}/files/{file}': { get: { summary: 'Download a file via signed link', parameters: [idParam, { name: 'file', in: 'path', required: true, schema: { type: 'string' } }, q('exp', { type: 'integer' }, true), q('sig', { type: 'string' }, true)], responses: { '200': { description: 'File (supports Range)' }, '403': { $ref: '#/components/responses/Error' }, '404': { $ref: '#/components/responses/Error' } } } },
  },
  components: {
    responses: { Error: { description: 'Error', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } } } } } },
    schemas: {
      Genre: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
      TitleSummary: { type: 'object', properties: { id: { type: 'string' }, type: { enum: ['movie', 'tv'] }, title: { type: 'string' }, overview: { type: 'string', nullable: true }, releaseDate: { type: 'string', nullable: true }, rating: { type: 'number', nullable: true }, poster: { type: 'string', nullable: true }, backdrop: { type: 'string', nullable: true }, genreIds: { type: 'array', items: { type: 'integer' } } } },
    },
  },
};

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { jsonLogger } from './lib/logger.js';
import { createProvider } from './providers/index.js';

const cfg = loadConfig();
if (cfg.PROVIDER === 'tmdb' && !cfg.TMDB_API_KEY) {
  jsonLogger('warn', 'TMDB_API_KEY is not set; metadata routes will return 500 not_configured');
}
if (cfg.DOWNLOAD_SIGNING_SECRET === 'change-me') {
  jsonLogger('warn', 'DOWNLOAD_SIGNING_SECRET is the default; set a random value in production');
}
createApp(cfg, createProvider(cfg), jsonLogger).listen(cfg.PORT, () =>
  jsonLogger('info', 'listening', { port: cfg.PORT, provider: cfg.PROVIDER }),
);

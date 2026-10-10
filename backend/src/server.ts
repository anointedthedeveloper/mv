import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { jsonLogger } from './lib/logger.js';
import { createProvider } from './providers/index.js';

const cfg = loadConfig();
if (cfg.DOWNLOAD_SIGNING_SECRET === 'change-me') {
  jsonLogger('warn', 'DOWNLOAD_SIGNING_SECRET is the default; set a random value in production');
}
createApp(cfg, createProvider(), jsonLogger).listen(cfg.PORT, () =>
  jsonLogger('info', 'listening', { port: cfg.PORT }),
);

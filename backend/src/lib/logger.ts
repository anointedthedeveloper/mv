import type { RequestHandler } from 'express';

export type Logger = (level: 'info' | 'warn' | 'error', msg: string, extra?: object) => void;

export const jsonLogger: Logger = (level, msg, extra) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...extra }));

export const noopLogger: Logger = () => {};

export const requestLogger = (log: Logger): RequestHandler => (req, res, next) => {
  const start = Date.now();
  res.on('finish', () =>
    log('info', 'request', {
      method: req.method,
      path: req.path, // query string omitted: it may contain signed tokens
      status: res.statusCode,
      ms: Date.now() - start,
    }),
  );
  next();
};

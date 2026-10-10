export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message);
  }
}
export class NotFoundError extends HttpError {
  constructor(what = 'Not found') { super(404, what, 'not_found'); }
}
export class ConfigError extends HttpError {
  constructor(message: string) { super(500, message, 'not_configured'); }
}
export class UpstreamError extends HttpError {
  constructor(message: string, status = 502) { super(status, message, 'upstream_error'); }
}

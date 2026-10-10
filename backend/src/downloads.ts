import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { NotFoundError } from './lib/errors.js';

export interface DownloadFile { file: string; label?: string; license?: string }
type Manifest = Record<string, DownloadFile[]>;

export interface DownloadsConfig {
  dir: string; secret: string; ttlSeconds: number; publicBaseUrl: string;
}

const sign = (secret: string, key: string, file: string, exp: number) =>
  createHmac('sha256', secret).update(`${key}\n${file}\n${exp}`).digest('hex');

/** Serves only files listed in DOWNLOADS_DIR/manifest.json, via HMAC-signed, expiring links. */
export class Downloads {
  constructor(private cfg: DownloadsConfig) {}

  private manifest(): Manifest {
    const p = join(this.cfg.dir, 'manifest.json');
    if (!existsSync(p)) return {};
    return JSON.parse(readFileSync(p, 'utf8')) as Manifest;
  }

  /** Resolve a manifest entry to an absolute path that stays inside the downloads dir. */
  private resolveFile(key: string, file: string): string {
    const entry = this.manifest()[key]?.find((f) => f.file === file);
    if (!entry) throw new NotFoundError('File not available');
    const root = resolve(this.cfg.dir);
    const full = resolve(root, basename(entry.file));
    if (!full.startsWith(root + sep) || !existsSync(full) || !statSync(full).isFile()) {
      throw new NotFoundError('File not available');
    }
    return full;
  }

  list(key: string) {
    const entries = this.manifest()[key];
    if (!entries?.length) throw new NotFoundError('No authorized downloads for this title');
    const exp = Math.floor(Date.now() / 1000) + this.cfg.ttlSeconds;
    return {
      id: key,
      expiresAt: new Date(exp * 1000).toISOString(),
      files: entries.flatMap((e) => {
        let size: number;
        try { size = statSync(this.resolveFile(key, e.file)).size; } catch { return []; }
        const sig = sign(this.cfg.secret, key, e.file, exp);
        const qs = new URLSearchParams({ exp: String(exp), sig });
        return [{
          file: e.file, label: e.label ?? e.file, license: e.license ?? null, sizeBytes: size,
          url: `${this.cfg.publicBaseUrl}/api/downloads/${encodeURIComponent(key)}/files/${encodeURIComponent(e.file)}?${qs}`,
        }];
      }),
    };
  }

  /** Returns the absolute path if the signature is valid and unexpired. */
  authorize(key: string, file: string, exp: string | undefined, sig: string | undefined): string {
    const e = Number(exp);
    if (!sig || !Number.isInteger(e) || e < Date.now() / 1000) return this.deny();
    const want = Buffer.from(sign(this.cfg.secret, key, file, e));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return this.deny();
    return this.resolveFile(key, file);
  }

  private deny(): never {
    throw Object.assign(new Error('Invalid or expired download link'), { status: 403, code: 'forbidden' });
  }
}

import archiver from 'archiver';
import type { Response } from 'express';
import type { MetadataProvider } from './types.js';

const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Streams a zip of episode metadata (JSON + CSV per season). Metadata only, no media. */
export async function exportSeasons(res: Response, provider: MetadataProvider, id: string, seasons: number[]) {
  const info = await provider.getTv(id);
  const data = [];
  for (const n of seasons) data.push(await provider.getSeason(id, n));

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${info.title.replace(/[^\w.-]+/g, '_')}-episodes.zip"`);
  const zip = archiver('zip', { zlib: { level: 9 } });
  zip.on('error', () => res.destroy());
  zip.pipe(res);
  zip.append(JSON.stringify(info, null, 2), { name: 'series.json' });
  const cols = ['episode', 'name', 'airDate', 'runtimeMinutes', 'rating', 'overview'] as const;
  for (const s of data) {
    const p = `season-${String(s.season).padStart(2, '0')}`;
    zip.append(JSON.stringify(s, null, 2), { name: `${p}.json` });
    const rows = s.episodes.map((e) => cols.map((c) => cell(e[c])).join(','));
    zip.append([cols.join(','), ...rows].join('\n'), { name: `${p}.csv` });
  }
  await zip.finalize();
}

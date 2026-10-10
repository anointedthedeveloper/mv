import archiver from 'archiver';
import * as tmdb from './tmdb.js';

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function toCsv(episodes) {
  const cols = ['episode', 'name', 'airDate', 'runtime', 'rating', 'overview'];
  const rows = episodes.map((e) => cols.map((c) => csvCell(e[c])).join(','));
  return [cols.join(','), ...rows].join('\n');
}

// Streams a zip of episode metadata (JSON + CSV per season) into `res`.
export async function exportSeasons(res, id, seasonNumbers) {
  const info = await tmdb.details('tv', id);
  const seasons = [];
  for (const n of seasonNumbers) seasons.push(await tmdb.season(id, n));

  const name = info.title.replace(/[^\w.-]+/g, '_');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-episodes.zip"`);

  const zip = archiver('zip', { zlib: { level: 9 } });
  zip.on('error', () => res.destroy());
  zip.pipe(res);
  zip.append(JSON.stringify(info, null, 2), { name: 'series.json' });
  for (const s of seasons) {
    const p = `season-${String(s.season).padStart(2, '0')}`;
    zip.append(JSON.stringify(s, null, 2), { name: `${p}.json` });
    zip.append(toCsv(s.episodes), { name: `${p}.csv` });
  }
  await zip.finalize();
}

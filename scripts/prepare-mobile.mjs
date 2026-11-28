/**
 * Chuẩn bị gói web tĩnh tối ưu cho vỏ Ứng dụng Di động Capacitor (Android / iOS) tại thư mục dist-mobile/
 * Chỉ đóng gói frontend + vendor + icon PNG, tuyệt đối không đưa thư mục api/, infra/, tests/ vào app di động.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist-mobile');
const apiOrigin = (process.env.MOBILE_API_ORIGIN || 'https://bando-cong-dong-dong-ngac.vercel.app').replace(/\/+$/, '');

const STATIC_FILES = [
  'index.html',
  'phap-ly.html',
  'citizen.css',
  'citizen-logic.js',
  'national-app.js',
  'config.js',
  'humg-data.js',
  'dem-grid-2km.js',
  'gis-utils.js',
  'knowledge-engine.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-96.png',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'sw.js'
];

const STATIC_DIRS = ['platform', 'vendor'];

async function copyDirFiltered(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === 'storage' || ent.name === 'security' || ent.name === 'operations') continue;
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      await copyDirFiltered(s, d);
    } else if (ent.isFile()) {
      await fs.copyFile(s, d);
    }
  }
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

for (const f of STATIC_FILES) {
  const src = path.join(rootDir, f);
  const dst = path.join(outDir, f);
  if (f === 'index.html') {
    let html = await fs.readFile(src, 'utf8');
    const bridgeTag = `<script>window.__VN_API_ORIGIN__=${JSON.stringify(apiOrigin)};</script>`;
    html = html.replace('<script type="module" src="./national-app.js"></script>', `${bridgeTag}\n  <script type="module" src="./national-app.js"></script>`);
    await fs.writeFile(dst, html, 'utf8');
  } else {
    await fs.copyFile(src, dst);
  }
}

for (const d of STATIC_DIRS) {
  await copyDirFiltered(path.join(rootDir, d), path.join(outDir, d));
}

console.log(`Prepared clean mobile webDir at ${outDir} (API origin: ${apiOrigin})`);

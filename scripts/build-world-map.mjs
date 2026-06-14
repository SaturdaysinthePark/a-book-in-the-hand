// build-world-map.mjs — one-time script to generate public/world-map.svg
// from Natural Earth 110m GeoJSON. Country paths get id="XX" (ISO alpha-2).
// Run: node scripts/build-world-map.mjs

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const W = 960;
const H = 480;
const PAD = 4;

// Equirectangular projection: lon → x, lat → y
function project([lon, lat]) {
  const x = PAD + ((lon + 180) / 360) * (W - 2 * PAD);
  const y = PAD + ((90 - lat) / 180) * (H - 2 * PAD);
  return [parseFloat(x.toFixed(2)), parseFloat(y.toFixed(2))];
}

function ringToD(ring) {
  let d = '';
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = project(ring[i]);
    d += (i === 0 ? 'M' : 'L') + x + ',' + y;
  }
  return d + 'Z';
}

function geomToD(geom) {
  if (!geom) return '';
  if (geom.type === 'Polygon') {
    return geom.coordinates.map(ringToD).join('');
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.flatMap((poly) => poly.map(ringToD)).join('');
  }
  return '';
}

async function main() {
  const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
  console.log('Fetching GeoJSON from Natural Earth 110m…');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const geojson = await res.json();

  const paths = [];
  let skipped = 0;
  for (const feature of geojson.features) {
    const iso = feature.properties?.ISO_A2;
    // Skip features with no valid ISO alpha-2 code
    if (!iso || iso === '-1' || iso === '-99' || iso.trim() === '') { skipped++; continue; }
    const d = geomToD(feature.geometry);
    if (!d) { skipped++; continue; }
    paths.push(`<path id="${iso}" d="${d}"/>`);
  }

  // Crop to ~80°N / 60°S — standard political map bounds (cuts off most of Antarctica).
  // y for lat 80° ≈ 30,  y for lat -60° ≈ 397  →  height = 367
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 30 960 367">
${paths.join('\n')}
</svg>`;

  const outPath = join(ROOT, 'public', 'world-map.svg');
  writeFileSync(outPath, svg, 'utf8');
  console.log(`✓ ${paths.length} countries written to public/world-map.svg (${skipped} skipped)`);
}

main().catch((err) => { console.error('✗', err.message); process.exit(1); });

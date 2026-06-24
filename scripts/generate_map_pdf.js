// generate_map_pdf.js — renders the world chunk map to docs/arena_map.pdf.
//
// Reads client/js/config/chunks.js (the single source of truth) and draws every
// chunk as a labelled box positioned by its real tile bounds, plus the doorways
// between them. Re-run whenever the chunk layout changes:
//
//   node scripts/generate_map_pdf.js
//
// Built chunks get a solid border; planned shells get a dashed border. The map is
// a planning aid — it shows the chunk name/description (art TBD) so the layout can
// be rearranged on paper before it's built. See CLAUDE.md "Map Expansion Plan".

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { CHUNKS, DOOR_SPECS, WORLD_TILES } = require('../client/js/config/chunks.js');

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
// Lighten a colour toward white by t (0..1) for readable fills behind text.
function lighten(n, t) {
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const L = (c) => Math.round(c + (255 - c) * t);
  return '#' + ((L(r) << 16) | (L(g) << 8) | L(b)).toString(16).padStart(6, '0');
}

const SCALE = 2.4;          // points per tile
const MARGIN = 36;
const TITLE_H = 54;
const worldW = WORLD_TILES.W * SCALE;
const worldH = WORLD_TILES.H * SCALE;
const pageW = worldW + MARGIN * 2;
const pageH = worldH + MARGIN * 2 + TITLE_H;

const outDir = path.join(__dirname, '..', 'docs');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'arena_map.pdf');

const doc = new PDFDocument({ size: [pageW, pageH], margin: 0 });
doc.pipe(fs.createWriteStream(outPath));

// World → page coordinates (tile Y increases south = down, same as PDF).
const px = (tx) => MARGIN + tx * SCALE;
const py = (ty) => MARGIN + TITLE_H + ty * SCALE;

// Title + legend
doc.fillColor('#111').font('Helvetica-Bold').fontSize(20)
  .text('ARENA — World Chunk Map', MARGIN, MARGIN - 8);
doc.font('Helvetica').fontSize(9).fillColor('#555')
  .text(`Chunk size 60×60 · world ${WORLD_TILES.W}×${WORLD_TILES.H} tiles · solid = built, dashed = planned shell`,
    MARGIN, MARGIN + 16);

// Doorways first (under the boxes): small bright squares at each door tile.
function doorTiles(d) {
  const t = [];
  for (const s of d.span) {
    if (d.axis === 'v') { t.push([d.at - 1, s], [d.at, s]); }
    else { t.push([s, d.at - 1], [s, d.at]); }
  }
  return t;
}
for (const d of DOOR_SPECS) {
  for (const [tx, ty] of doorTiles(d)) {
    doc.rect(px(tx), py(ty), SCALE, SCALE).fill('#ffd24a');
  }
}

// Chunk boxes
for (const c of Object.values(CHUNKS)) {
  const x = px(c.minX), y = py(c.minY);
  const w = (c.maxX - c.minX + 1) * SCALE;
  const h = (c.maxY - c.minY + 1) * SCALE;

  doc.rect(x, y, w, h).fill(lighten(c.color, 0.55));
  doc.lineWidth(c.built ? 1.6 : 1.2);
  if (c.built) doc.undash(); else doc.dash(4, { space: 3 });
  doc.rect(x, y, w, h).stroke(hex(c.color));
  doc.undash();

  // Labels
  const cx = x + w / 2;
  doc.fillColor('#1a1a1a').font('Helvetica-Bold').fontSize(11)
    .text(c.name, x + 4, y + h / 2 - 16, { width: w - 8, align: 'center' });
  doc.font('Helvetica').fontSize(7.5).fillColor('#333')
    .text(c.desc, x + 4, y + h / 2 - 2, { width: w - 8, align: 'center' });
  doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#666')
    .text(`${c.legacy ? 'legacy 40×30' : '60×60'}${c.built ? '' : ' · shell'}`,
      x + 4, y + h - 12, { width: w - 8, align: 'center' });
}

doc.end();
console.log(`Map written to ${path.relative(process.cwd(), outPath)} (${Object.keys(CHUNKS).length} chunks).`);

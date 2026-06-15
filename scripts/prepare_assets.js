// prepare_assets.js — turns the source JPEGs in client/assets/source/ into
// game-ready art: copies zone backgrounds as-is, and crops + background-removes
// the sprite subjects into transparent PNGs.
//
//   npm install sharp
//   node scripts/prepare_assets.js
//
// Missing sources are reported and skipped (never fabricated). After running,
// it writes client/assets/asset-manifest.js listing exactly what was produced
// so the client only attempts to load assets that actually exist.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'client', 'assets', 'source');
const SPRITES = path.join(ROOT, 'client', 'assets', 'sprites');
const BACKGROUNDS = path.join(ROOT, 'client', 'assets', 'backgrounds');
const MANIFEST = path.join(ROOT, 'client', 'assets', 'asset-manifest.js');

for (const dir of [SOURCE, SPRITES, BACKGROUNDS]) {
  fs.mkdirSync(dir, { recursive: true });
}

// Backgrounds — copied as-is (no processing). { src, outName, key }
const BACKGROUND_JOBS = [
  { src: 'Arena_Lobby.jpg', outName: 'lobby.jpg', key: 'lobby' },
  { src: 'TRAINING_GROUNDS.jpg', outName: 'training_grounds.jpg', key: 'training_grounds' },
  { src: 'cave2.jpg', outName: 'boss_cave.jpg', key: 'boss_cave' },
  // Arena_Arena.jpg is the wager zone — not built yet, skipped on purpose.
];

// Sprites — crop the subject out of its (art-sheet) frame, then remove the
// background by edge-seeded flood fill: starting from the crop borders, grow
// through pixels that are locally similar (localTol per channel). This follows
// gradient/textured backgrounds but stops at the subject's silhouette, so a
// dark subject on a dark-ish background is preserved (a flat colour key would
// erase it). Crops are absolute source-pixel boxes around the chosen subject.
const SPRITE_JOBS = [
  {
    // dummy_image.jpg is 1254x1254 — the scarecrow is centred on sandy ground.
    // Sand is light + uniform and the wood/cloth subject is dark, so a wide
    // tolerance removes the sand, shadow and rocks while keeping the subject.
    src: 'dummy_image.jpg',
    crop: { left: 330, top: 120, width: 595, height: 965 },
    tol: 72,
    outs: ['dummy.png'],
    keys: ['dummy'],
  },
  {
    // cowboss.jpg is 1254x909 — the large front-facing bull on the left of the
    // design sheet (avoiding the stats text, side/back views, thumbnails). The
    // bull is dark on a dark gradient, so the tolerance is tight to avoid
    // eating the subject (a faint background halo is expected).
    src: 'cowboss.jpg',
    crop: { left: 225, top: 88, width: 525, height: 605 },
    tol: 24,
    outs: ['boss.png'],
    keys: ['boss'],
  },
  {
    // User_Model.jpg is 1280x965 — the leftmost (front-facing) of four
    // rotations, on the uniform parchment panel.
    src: 'User_Model.jpg',
    crop: { left: 285, top: 90, width: 150, height: 396 },
    tol: 32,
    outs: ['player_male.png', 'player_female.png'], // female differentiated later via tint
    keys: ['player_male', 'player_female'],
  },
];

// Contiguous background removal. Samples a background reference colour from a
// small patch at the top-centre of the crop (reliably background, above the
// subject's head), then flood-fills inward from the borders removing only
// pixels within `tol` per channel of that reference. Because membership is
// tested against the fixed reference (not the running neighbour), the fill
// stops hard at any contrasting subject pixel and never walks across a soft
// gradient into the subject — while still following a non-uniform background.
async function removeBackground(inputBuffer, tol) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info; // channels === 4 after ensureAlpha
  const total = width * height;

  // Reference = average of a patch at the top centre (background above subject)
  let sr = 0, sg = 0, sb = 0, n = 0;
  const cx = width >> 1;
  for (let y = 2; y < Math.min(8, height); y++) {
    for (let x = Math.max(0, cx - 5); x < Math.min(width, cx + 5); x++) {
      const i = (y * width + x) * channels;
      sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++;
    }
  }
  const ref = [sr / n, sg / n, sb / n];

  const removed = new Uint8Array(total);
  const queue = new Int32Array(total);
  let qlen = 0;

  const matchesBg = (p) => {
    const i = p * channels;
    return Math.abs(data[i] - ref[0]) <= tol
      && Math.abs(data[i + 1] - ref[1]) <= tol
      && Math.abs(data[i + 2] - ref[2]) <= tol;
  };
  const enqueue = (p) => { if (!removed[p] && matchesBg(p)) { removed[p] = 1; queue[qlen++] = p; } };

  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }

  let head = 0;
  while (head < qlen) {
    const p = queue[head++];
    const px = p % width;
    const py = (p / width) | 0;
    if (px > 0) enqueue(p - 1);
    if (px < width - 1) enqueue(p + 1);
    if (py > 0) enqueue(p - width);
    if (py < height - 1) enqueue(p + width);
  }

  for (let p = 0; p < total; p++) {
    if (removed[p]) data[p * channels + 3] = 0;
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

function clampCrop(crop, meta) {
  let { left, top, width, height } = crop;
  if (crop.centre) {
    left = Math.max(0, Math.floor((meta.width - crop.width) / 2));
    top = Math.max(0, Math.floor((meta.height - crop.height) / 2));
  }
  width = Math.min(width, meta.width - left);
  height = Math.min(height, meta.height - top);
  return { left, top, width, height };
}

async function main() {
  const produced = { backgrounds: {}, sprites: {} };
  const missing = [];

  // Backgrounds
  for (const job of BACKGROUND_JOBS) {
    const src = path.join(SOURCE, job.src);
    if (!fs.existsSync(src)) { missing.push(job.src); continue; }
    const out = path.join(BACKGROUNDS, job.outName);
    fs.copyFileSync(src, out);
    produced.backgrounds[job.key] = `backgrounds/${job.outName}`;
    console.log(`[bg]     ${job.src} -> backgrounds/${job.outName}`);
  }

  // Sprites
  for (const job of SPRITE_JOBS) {
    const src = path.join(SOURCE, job.src);
    if (!fs.existsSync(src)) { missing.push(job.src); continue; }

    const meta = await sharp(src).metadata();
    const region = clampCrop(job.crop, meta);
    const cropped = await sharp(src).extract(region).toBuffer();
    const png = await removeBackground(cropped, job.tol);

    job.outs.forEach((outName, i) => {
      const out = path.join(SPRITES, outName);
      fs.writeFileSync(out, png);
      produced.sprites[job.keys[i]] = `sprites/${outName}`;
      console.log(`[sprite] ${job.src} -> sprites/${outName} (${region.width}x${region.height})`);
    });
  }

  // Manifest — the client loads only what exists, so missing art falls back to
  // placeholder rendering with zero load errors.
  const manifest = `// AUTO-GENERATED by scripts/prepare_assets.js — do not edit by hand.\n`
    + `// Lists art assets that were successfully produced from client/assets/source/.\n`
    + `const ASSET_MANIFEST = ${JSON.stringify(produced, null, 2)};\n`;
  fs.writeFileSync(MANIFEST, manifest);

  console.log('\nManifest written to client/assets/asset-manifest.js');
  if (missing.length > 0) {
    console.warn(`\n[MISSING] ${missing.length} source file(s) not found in client/assets/source/:`);
    for (const m of missing) console.warn(`  - ${m}`);
    console.warn('Drop the source JPEGs into client/assets/source/ and re-run this script.');
  } else {
    console.log('\nAll sources processed.');
  }
}

main().catch((err) => {
  console.error('Asset preparation failed:', err);
  process.exit(1);
});

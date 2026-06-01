/* eslint-disable */
const path = require("path");
const { Jimp } = require("jimp");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const SOURCE = path.join(ASSETS, "logo.png");

const BRAND_BG_HEX = 0x0a0a0fff;

async function loadAndKeyOut(srcPath) {
  const img = await Jimp.read(srcPath);
  img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
    const d = this.bitmap.data;
    const r = d[idx];
    const g = d[idx + 1];
    const b = d[idx + 2];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    const sat = max === 0 ? 0 : (max - min) / max;

    if (sat < 0.12 && lightness > 170) {
      d[idx + 3] = 0;
      return;
    }

    if (sat < 0.2 && lightness > 200) {
      d[idx + 3] = 0;
      return;
    }

    d[idx + 3] = 255;
  });
  return img;
}

function makeCanvas(size, rgba) {
  return new Jimp({ width: size, height: size, color: rgba });
}

async function fitOnto(canvas, logo, scale) {
  const targetW = Math.round(canvas.bitmap.width * scale);
  const targetH = Math.round(canvas.bitmap.height * scale);
  const clone = logo.clone();
  clone.resize({ w: targetW, h: targetH });
  const x = Math.round((canvas.bitmap.width - targetW) / 2);
  const y = Math.round((canvas.bitmap.height - targetH) / 2);
  canvas.composite(clone, x, y);
  return canvas;
}

async function whiteSilhouette(logo) {
  const clone = logo.clone();
  clone.scan(0, 0, clone.bitmap.width, clone.bitmap.height, function (x, y, idx) {
    const d = this.bitmap.data;
    if (d[idx + 3] > 0) {
      d[idx] = 255;
      d[idx + 1] = 255;
      d[idx + 2] = 255;
    }
  });
  return clone;
}

(async () => {
  console.log("Reading source:", SOURCE);
  const keyed = await loadAndKeyOut(SOURCE);
  const srcW = keyed.bitmap.width;
  const srcH = keyed.bitmap.height;
  console.log(`Source ${srcW}x${srcH}, keying done.`);

  // 1. logo.png — clean transparent square at 1024
  const logoOut = keyed.clone();
  logoOut.resize({ w: 1024, h: 1024 });
  await logoOut.write(path.join(ASSETS, "logo.png"));
  console.log("Wrote logo.png");

  // 2. favicon.png — 64x64 transparent
  const favicon = keyed.clone();
  favicon.resize({ w: 64, h: 64 });
  await favicon.write(path.join(ASSETS, "favicon.png"));
  console.log("Wrote favicon.png");

  // 3. icon.png — 1024 opaque dark bg, logo at 78%
  const icon = makeCanvas(1024, BRAND_BG_HEX);
  await fitOnto(icon, keyed, 0.78);
  await icon.write(path.join(ASSETS, "icon.png"));
  console.log("Wrote icon.png");

  // 4. adaptive-icon.png — 1024 transparent foreground, logo at 60% safe-zone size
  const adaptive = makeCanvas(1024, 0x00000000);
  await fitOnto(adaptive, keyed, 0.6);
  await adaptive.write(path.join(ASSETS, "adaptive-icon.png"));
  console.log("Wrote adaptive-icon.png");

  // 5. splash.png — 2048 dark bg, logo at 28%
  const splash = makeCanvas(2048, BRAND_BG_HEX);
  await fitOnto(splash, keyed, 0.28);
  await splash.write(path.join(ASSETS, "splash.png"));
  console.log("Wrote splash.png");

  // 6. notification-icon.png — 256 white silhouette on transparent, scaled to 75%
  const whiteLogo = await whiteSilhouette(keyed);
  const notif = makeCanvas(256, 0x00000000);
  await fitOnto(notif, whiteLogo, 0.75);
  await notif.write(path.join(ASSETS, "notification-icon.png"));
  console.log("Wrote notification-icon.png");

  console.log("Done.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

/* eslint-disable */
const path = require("path");
const fs = require("fs");
const { Jimp } = require("jimp");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const SOURCE = path.join(ASSETS, "logo.png");
const ANDROID_RES = path.join(
  ROOT,
  "android",
  "app",
  "src",
  "main",
  "res",
);

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

function fitOnto(canvas, logo, scale) {
  const targetW = Math.round(canvas.bitmap.width * scale);
  const targetH = Math.round(canvas.bitmap.height * scale);
  const clone = logo.clone();
  clone.resize({ w: targetW, h: targetH });
  const x = Math.round((canvas.bitmap.width - targetW) / 2);
  const y = Math.round((canvas.bitmap.height - targetH) / 2);
  canvas.composite(clone, x, y);
  return canvas;
}

function whiteSilhouette(logo) {
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

function circleMask(img) {
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;
  img.scan(0, 0, w, h, function (x, y, idx) {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    if (dx * dx + dy * dy > r * r) {
      this.bitmap.data[idx + 3] = 0;
    }
  });
  return img;
}

async function ensureDir(p) {
  await fs.promises.mkdir(p, { recursive: true });
}

async function safeUnlink(p) {
  try {
    await fs.promises.unlink(p);
  } catch (_) {}
}

(async () => {
  console.log("Reading source:", SOURCE);
  const keyed = await loadAndKeyOut(SOURCE);
  console.log(`Source ${keyed.bitmap.width}x${keyed.bitmap.height}, keyed.`);

  // --- 1. Expo asset folder (used by expo prebuild / EAS) -------------------
  {
    const logoOut = keyed.clone();
    logoOut.resize({ w: 1024, h: 1024 });
    await logoOut.write(path.join(ASSETS, "logo.png"));

    const favicon = keyed.clone();
    favicon.resize({ w: 64, h: 64 });
    await favicon.write(path.join(ASSETS, "favicon.png"));

    const icon = makeCanvas(1024, BRAND_BG_HEX);
    fitOnto(icon, keyed, 0.78);
    await icon.write(path.join(ASSETS, "icon.png"));

    const adaptive = makeCanvas(1024, 0x00000000);
    fitOnto(adaptive, keyed, 0.6);
    await adaptive.write(path.join(ASSETS, "adaptive-icon.png"));

    const splash = makeCanvas(2048, BRAND_BG_HEX);
    fitOnto(splash, keyed, 0.28);
    await splash.write(path.join(ASSETS, "splash.png"));

    const notif = makeCanvas(256, 0x00000000);
    fitOnto(notif, whiteSilhouette(keyed), 0.75);
    await notif.write(path.join(ASSETS, "notification-icon.png"));

    console.log("Wrote Expo /assets bundle.");
  }

  // --- 2. Native Android resources ------------------------------------------
  // Legacy + round launcher: 48/72/96/144/192 px at mdpi..xxxhdpi
  // Adaptive foreground: full bitmap is 108dp -> 108/162/216/324/432 px
  // Splash logo (Expo default): 100/150/200/300/400 px
  if (fs.existsSync(ANDROID_RES)) {
    const densities = [
      { name: "mdpi", legacy: 48, adaptive: 108, splash: 100 },
      { name: "hdpi", legacy: 72, adaptive: 162, splash: 150 },
      { name: "xhdpi", legacy: 96, adaptive: 216, splash: 200 },
      { name: "xxhdpi", legacy: 144, adaptive: 324, splash: 300 },
      { name: "xxxhdpi", legacy: 192, adaptive: 432, splash: 400 },
    ];

    for (const d of densities) {
      const mipDir = path.join(ANDROID_RES, `mipmap-${d.name}`);
      await ensureDir(mipDir);

      // ic_launcher.png — square legacy, dark bg, logo at 78%
      {
        const c = makeCanvas(d.legacy, BRAND_BG_HEX);
        fitOnto(c, keyed, 0.78);
        await c.write(path.join(mipDir, "ic_launcher.png"));
        await safeUnlink(path.join(mipDir, "ic_launcher.webp"));
      }

      // ic_launcher_round.png — same but circle-masked
      {
        const c = makeCanvas(d.legacy, BRAND_BG_HEX);
        fitOnto(c, keyed, 0.78);
        circleMask(c);
        await c.write(path.join(mipDir, "ic_launcher_round.png"));
        await safeUnlink(path.join(mipDir, "ic_launcher_round.webp"));
      }

      // ic_launcher_foreground.png — transparent, logo at ~50% of 108dp
      // (background drawable provides the dark color).
      {
        const c = makeCanvas(d.adaptive, 0x00000000);
        fitOnto(c, keyed, 0.5);
        await c.write(path.join(mipDir, "ic_launcher_foreground.png"));
        await safeUnlink(path.join(mipDir, "ic_launcher_foreground.webp"));
      }

      // splashscreen_logo.png — transparent (splash bg comes from theme), logo fills
      {
        const drawableDir = path.join(ANDROID_RES, `drawable-${d.name}`);
        await ensureDir(drawableDir);
        const c = makeCanvas(d.splash, 0x00000000);
        fitOnto(c, keyed, 0.92);
        await c.write(path.join(drawableDir, "splashscreen_logo.png"));
      }
    }
    console.log("Wrote native Android mipmap + drawable resources.");
  } else {
    console.log("No android/ folder — skipping native res generation.");
  }

  console.log("Done.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public", "appicon-1024.png");
const iconsDir = join(root, "public", "icons");

const sizes = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

if (!existsSync(source)) {
  console.error(
    "Source not found: public/appicon-1024.png — place the 1024×1024 icon there first.",
  );
  process.exit(1);
}

mkdirSync(iconsDir, { recursive: true });

for (const { name, size } of sizes) {
  const out = join(iconsDir, name);
  await sharp(source).resize(size, size).png().toFile(out);
  console.log(`Wrote ${out}`);
}

const legacyApple = join(root, "public", "apple-touch-icon.png");
copyFileSync(join(iconsDir, "apple-touch-icon.png"), legacyApple);
console.log(`Wrote ${legacyApple}`);

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public", "appicon-1024.png");
const assetsDir = join(root, "assets");
const iconOnly = join(assetsDir, "icon-only.png");

if (!existsSync(source)) {
  console.error("Missing source: public/appicon-1024.png");
  process.exit(1);
}

const meta = await sharp(source).metadata();
if (meta.width !== 1024 || meta.height !== 1024) {
  console.error(`Expected 1024×1024, got ${meta.width}×${meta.height}`);
  process.exit(1);
}
if (meta.hasAlpha) {
  console.warn(
    "Warning: source has transparency; flattening onto black for iOS App Store compliance.",
  );
  mkdirSync(assetsDir, { recursive: true });
  await sharp(source).flatten({ background: "#000000" }).png().toFile(iconOnly);
} else {
  mkdirSync(assetsDir, { recursive: true });
  copyFileSync(source, iconOnly);
}

console.log(`Synced ${iconOnly}`);

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["capacitor-assets", "generate", "--ios"],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("iOS AppIcon updated in ios/App/App/Assets.xcassets/AppIcon.appiconset/");

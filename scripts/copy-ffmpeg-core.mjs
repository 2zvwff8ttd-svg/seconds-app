import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules", "@ffmpeg", "core", "dist", "umd");
const destDir = join(root, "public", "ffmpeg");

await mkdir(destDir, { recursive: true });

for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  await copyFile(join(srcDir, name), join(destDir, name));
}

console.log("Copied ffmpeg-core to public/ffmpeg/");

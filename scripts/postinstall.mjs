/**
 * postinstall entry — ffmpeg assets always; native camera patches only on local/iOS CI.
 * Vercel (VERCEL=1) builds Next.js only and must not patch node_modules Swift sources.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runNodeScript(relativePath) {
  const scriptPath = resolve(root, relativePath);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function shouldSkipNativeCameraPatches() {
  if (process.env.SKIP_NATIVE_CAMERA_PATCH === "1") return true;
  // Vercel sets VERCEL=1 during install/build (web-only; no Capacitor iOS compile).
  if (process.env.VERCEL === "1") return true;
  return false;
}

runNodeScript("scripts/copy-ffmpeg-core.mjs");

if (shouldSkipNativeCameraPatches()) {
  console.log(
    "[postinstall] skip native camera-preview patches (web-only environment)",
  );
  process.exit(0);
}

runNodeScript("scripts/patch-camera-preview-android.mjs");
runNodeScript("scripts/patch-camera-preview-ios.mjs");
runNodeScript("scripts/verify-camera-preview-ios-patch.mjs");

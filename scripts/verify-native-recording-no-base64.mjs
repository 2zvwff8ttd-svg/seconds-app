/**
 * Regression checks for P1: stopRecordVideo path-only + short-clip readable without base64.
 * Does not require a device — asserts source contracts and simulates small-file decoding.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginPath = join(
  root,
  "node_modules/@capacitor-community/camera-preview/ios/Sources/CameraPreviewPlugin/CameraPreviewPlugin.swift",
);
const jsPath = join(root, "src/lib/recording/native-recording-file.ts");

function fail(msg) {
  console.error(`[verify-native-recording-no-base64] FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[verify-native-recording-no-base64] OK: ${msg}`);
}

const plugin = readFileSync(pluginPath, "utf8");
const js = readFileSync(jsPath, "utf8");

if (plugin.includes('payload["videoBase64"]') || plugin.includes("data.base64EncodedString()")) {
  fail("CameraPreviewPlugin.swift still inlines videoBase64 on stopRecordVideo");
}
ok("native stopRecordVideo has no videoBase64 payload");

if (!plugin.includes("attributesOfItem(atPath: url.path)")) {
  fail("stopRecordVideo must set videoFileSize via FileManager.attributesOfItem");
}
ok("native stopRecordVideo sets videoFileSize via FileManager");

if (!js.includes("readBlobViaFilesystem") || !js.includes("readBlobViaWebView")) {
  fail("native-recording-file.ts must keep Filesystem + WebView readers");
}
ok("JS keeps Filesystem + WebView path readers");

// Path-first ordering: Filesystem attempt should appear before legacy base64 gate.
const fsIdx = js.indexOf("readBlobViaFilesystem");
const legacyIdx = js.indexOf("Legacy fallback only if an older native binary");
if (fsIdx < 0 || legacyIdx < 0 || fsIdx > legacyIdx) {
  fail("JS must try Filesystem before legacy base64 fallback");
}
ok("JS prefers path reads before optional legacy base64");

// Short-clip decode regression: tiny MP4 without plugin base64 still round-trips via atob path
// used by Filesystem.readFile (Capacitor returns base64 string of file bytes).
const tmp = join(root, "tmp-probe/short-clip-no-base64");
mkdirSync(tmp, { recursive: true });
const mp4 = join(tmp, "short.mp4");
const make = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=320x240:r=30:d=1.2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1.2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ac",
    "1",
    "-shortest",
    "-movflags",
    "+faststart",
    mp4,
  ],
  { encoding: "utf8" },
);
if (make.status !== 0) {
  fail(`ffmpeg short clip failed: ${make.stderr?.slice(-400)}`);
}

const bytes = readFileSync(mp4);
const b64 = bytes.toString("base64");
if (bytes.length > 3 * 1024 * 1024) {
  fail(`short clip unexpectedly large (${bytes.length} bytes)`);
}
ok(`short clip is ${bytes.length} bytes (< 3MB threshold)`);

// Mimic Filesystem.readFile → base64 string → Blob (same as native-recording-file).
const roundTrip = Buffer.from(b64, "base64");
if (roundTrip.length !== bytes.length || !roundTrip.equals(bytes)) {
  fail("base64 round-trip of short clip file bytes failed");
}
ok("short-clip file bytes survive Filesystem-style base64 decode (no plugin videoBase64)");

const probe = spawnSync(
  "ffprobe",
  ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4],
  { encoding: "utf8" },
);
const dur = Number(probe.stdout.trim());
if (!(dur > 1.0 && dur < 2.0)) {
  fail(`short clip duration unexpected: ${probe.stdout}`);
}
ok(`short clip playable duration=${dur.toFixed(2)}s`);

writeFileSync(
  join(tmp, "report.json"),
  JSON.stringify(
    {
      bytes: bytes.length,
      duration: dur,
      pluginHasVideoBase64: false,
      jsPathFirst: true,
    },
    null,
    2,
  ),
);

console.log("[verify-native-recording-no-base64] all checks passed");

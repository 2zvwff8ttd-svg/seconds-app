import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const targets = [
  "android/app/build",
  "android/build",
  "android/.gradle",
  "android/capacitor-cordova-android-plugins/build",
];

for (const rel of targets) {
  const path = resolve(process.cwd(), rel);
  try {
    await rm(path, { recursive: true, force: true });
    console.log(`[clean-android-build] removed ${rel}`);
  } catch (err) {
    console.warn(`[clean-android-build] skip ${rel}:`, err);
  }
}

console.log("[clean-android-build] done");

/**
 * Keeps Android strings.xml safe for builds.
 * "?" at the start of a string value is parsed as ?attr/... by aapt.
 * &#63; entities decode to "?" during merge and still fail — use \u003f instead.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const stringsPath = resolve(
  process.cwd(),
  "android/app/src/main/res/values/strings.xml",
);

const SAFE_STRINGS = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Seconds</string>
    <!-- launcher_name uses \\u003f prefix for question mark (safe for aapt) -->
    <string name="launcher_name">\\u003fSeconds</string>
    <string name="title_activity_main">@string/launcher_name</string>
    <string name="package_name">com.seconds.app</string>
    <string name="custom_url_scheme">com.seconds.app</string>
</resources>
`;

const content = await readFile(stringsPath, "utf8");

const broken =
  />\?Seconds</.test(content) ||
  /&#63;Seconds/.test(content) ||
  /<string name="app_name">\?/.test(content) ||
  /<string name="launcher_name">\?/.test(content);
const missingLauncher = !content.includes('name="launcher_name"');

if (broken || missingLauncher || !content.includes("\\u003fSeconds")) {
  await writeFile(stringsPath, SAFE_STRINGS, "utf8");
  console.log("[fix-android-strings] Updated android/app/src/main/res/values/strings.xml");
} else {
  console.log("[fix-android-strings] strings.xml already safe");
}

async function scanDir(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "build" ||
        entry.name === ".gradle" ||
        entry.name === ".idea"
      ) {
        continue;
      }
      await scanDir(full);
      continue;
    }
    if (!entry.name.endsWith(".xml")) continue;
    const text = await readFile(full, "utf8");
    if (/\?Seconds/.test(text) && !text.includes("\\u003fSeconds")) {
      console.warn(`[fix-android-strings] WARNING: literal ?Seconds in ${full}`);
    }
  }
}

await scanDir(resolve(process.cwd(), "android/app/src/main/res"));

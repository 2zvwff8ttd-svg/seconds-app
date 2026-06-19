import fs from "node:fs";
import path from "node:path";

const pages = [
  { label: "/", file: "", manifestKey: "/page" },
  { label: "/login", file: "login", manifestKey: "/login/page" },
  { label: "/post", file: "post", manifestKey: "/post/page" },
  { label: "/privacy", file: "privacy", manifestKey: "/privacy/page" },
];

const dir = ".next/server/app";

function loadManifest(pagePath, manifestKey) {
  const file = pagePath
    ? path.join(dir, pagePath, "page_client-reference-manifest.js")
    : path.join(dir, "page_client-reference-manifest.js");
  const txt = fs.readFileSync(file, "utf8");
  const fn = new Function(`${txt}; return globalThis.__RSC_MANIFEST;`);
  const all = fn();
  const manifest = all[manifestKey];
  if (!manifest) throw new Error(`missing manifest ${manifestKey}`);
  return manifest;
}

function chunkSizes() {
  const chunkDir = ".next/static/chunks";
  const map = new Map();
  for (const f of fs.readdirSync(chunkDir)) {
    if (!f.endsWith(".js")) continue;
    map.set(
      `/_next/static/chunks/${f}`,
      Math.round(fs.statSync(path.join(chunkDir, f)).size / 1024),
    );
  }
  return map;
}

const sizes = chunkSizes();
const byPage = pages.map(({ label, file, manifestKey }) => {
  const manifest = loadManifest(file, manifestKey);
  const entry = manifest.entryJSFiles ?? {};
  const chunks = new Set();
  const modules = [];
  for (const [mod, files] of Object.entries(entry)) {
    for (const f of files) chunks.add(`/_next/static/chunks/${f}`);
  }
  for (const [mod, info] of Object.entries(manifest.clientModules ?? {})) {
    const short = mod.replace(/^\[project\]\//, "");
    if (short.includes("node_modules/next/dist")) continue;
    if (
      /home\/|post\/|opening\/|onboarding\/|ffmpeg|ClientAppGate|auth\/AuthForm|legal\//.test(
        short,
      )
    ) {
      modules.push(short);
    }
    for (const c of info.chunks ?? []) chunks.add(c);
  }
  return { label, chunks: [...chunks].sort(), modules };
});

for (const p of byPage) {
  console.log(`=== ${p.label} ===`);
  let total = 0;
  for (const c of p.chunks) {
    const kb = sizes.get(c) ?? 0;
    total += kb;
    console.log(`  ${String(kb).padStart(4)} KB  ${c}`);
  }
  console.log(`  TOTAL (unique chunks listed): ~${total} KB`);
  if (p.modules.length) {
    console.log("  modules:");
    for (const m of p.modules) console.log(`    - ${m}`);
  }
  console.log();
}

const loginPage = byPage.find((p) => p.label === "/login");
const privacyPage = byPage.find((p) => p.label === "/privacy");
const homePage = byPage.find((p) => p.label === "/");
const postPage = byPage.find((p) => p.label === "/post");
if (!loginPage || !privacyPage || !homePage || !postPage) throw new Error("missing page");

const loginPrivChunks = new Set([...loginPage.chunks, ...privacyPage.chunks]);

function report(title, page) {
  console.log(title);
  for (const c of page.chunks.filter((x) => !loginPrivChunks.has(x))) {
    console.log(`  ${sizes.get(c) ?? "?"} KB  ${c}`);
  }
}

report("ONLY / (not in login+privacy chunks):", homePage);
report("ONLY /post (not in login+privacy chunks):", postPage);

const home = new Set(homePage.chunks);
const post = new Set(postPage.chunks);
console.log("COMMON / and /post (not login+privacy):");
for (const c of [...home].filter((x) => post.has(x) && !loginPrivChunks.has(x))) {
  console.log(`  ${sizes.get(c) ?? "?"} KB  ${c}`);
}

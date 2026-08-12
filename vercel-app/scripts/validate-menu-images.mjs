import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import sharp from "sharp";

const appRoot = process.cwd();
const manifestPath = path.join(appRoot, "public/menu-images/manifest.json");
const csvPath = path.join(appRoot, "public/data/menus.csv");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const parsed = Papa.parse(fs.readFileSync(csvPath, "utf8"), { header: true, skipEmptyLines: true });

if (parsed.errors.length) throw new Error(`menus.csv parse error: ${parsed.errors[0].message}`);
if (!Array.isArray(manifest.items) || manifest.items.length === 0) throw new Error("image manifest has no items");

const menuIds = new Set(parsed.data.map((row) => `${row.brand}::${row.menu}`));
const seen = new Set();
const allowedMatchMethods = new Set(["normalized_exact", "high_confidence_name", "official_family_representative", "official_catalog_representative"]);
const assetPaths = new Set();

for (const item of manifest.items) {
  if (seen.has(item.id)) throw new Error(`duplicate image id: ${item.id}`);
  seen.add(item.id);
  if (!menuIds.has(item.id)) throw new Error(`image id is not in menus.csv: ${item.id}`);
  if (!item.assetSourceUrl?.startsWith("https://") || !item.pageSourceUrl?.startsWith("https://")) {
    throw new Error(`non-HTTPS provenance URL: ${item.id}`);
  }
  if (!allowedMatchMethods.has(item.matchMethod)) throw new Error(`unsupported match method: ${item.id} (${item.matchMethod})`);
  if (typeof item.matchScore !== "number" || item.matchScore < 0 || item.matchScore > 1) {
    throw new Error(`invalid match score: ${item.id}`);
  }

  const assetPath = path.join(appRoot, "public", item.src.replace(/^\//, ""));
  assetPaths.add(assetPath);
  const bytes = fs.readFileSync(assetPath);
  if (bytes.length < 1_500) throw new Error(`image asset is unexpectedly small: ${item.id}`);
}

const missing = [...menuIds].filter((id) => !seen.has(id));
if (missing.length) throw new Error(`menus without an image mapping (${missing.length}): ${missing.slice(0, 5).join(", ")}`);
if (seen.size !== menuIds.size) throw new Error(`coverage mismatch: ${seen.size}/${menuIds.size}`);
if (manifest.coverage?.total !== menuIds.size || manifest.coverage?.mapped !== menuIds.size || manifest.coverage?.missing !== 0) {
  throw new Error(`manifest coverage summary mismatch: ${JSON.stringify(manifest.coverage)}`);
}

for (const assetPath of assetPaths) {
  const metadata = await sharp(assetPath).metadata();
  if (metadata.format !== "webp" || metadata.width !== 900 || metadata.height !== 700) {
    throw new Error(`optimized asset shape mismatch: ${assetPath} (${metadata.format} ${metadata.width}x${metadata.height})`);
  }
}

console.log(`menu image validation PASS: ${seen.size}/${menuIds.size} menu mappings, ${assetPaths.size} official optimized assets, 0 missing`);

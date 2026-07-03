import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const APP_DIR = join(homedir(), ".ttrpg-ocr-review");
export const CONFIG_PATH = join(APP_DIR, "config.json");
export const WORKSPACE_DIR = join(APP_DIR, "workspace");
export const TMP_DIR = join(APP_DIR, "tmp");

export function docDir(docId: string): string {
  return join(WORKSPACE_DIR, docId);
}

export function pagesDir(docId: string): string {
  return join(docDir(docId), "pages");
}

export function nativeDir(docId: string): string {
  return join(docDir(docId), "native");
}

export function ocrRunsDir(docId: string): string {
  return join(docDir(docId), "ocr-runs");
}

export function comparisonsDir(docId: string): string {
  return join(docDir(docId), "comparisons");
}

export function sourcePdfPath(docId: string): string {
  return join(docDir(docId), "source.pdf");
}

export function metaPath(docId: string): string {
  return join(docDir(docId), "meta.json");
}

export function jsonlCachePath(docId: string): string {
  return join(docDir(docId), "jsonl.json");
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

// Content-hashing the PDF gives every load of the same file a stable id, so
// re-opening it reuses cached page renders / native text / OCR runs. Hashed
// as a stream so a large upload never has to sit fully in memory just to be
// identified.
export function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex").slice(0, 16)));
  });
}

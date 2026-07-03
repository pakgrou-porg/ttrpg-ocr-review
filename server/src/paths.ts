import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const APP_DIR = join(homedir(), ".ttrpg-ocr-review");
export const CONFIG_PATH = join(APP_DIR, "config.json");
export const WORKSPACE_DIR = join(APP_DIR, "workspace");

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
// re-opening it reuses cached page renders / native text / OCR runs.
export function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

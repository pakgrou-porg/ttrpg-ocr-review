import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NativeTextResult } from "@ttrpg-ocr-review/shared";
import { ensureDir, nativeDir, pagesDir, sourcePdfPath } from "./paths.js";
import { extractNativeText, renderPagePng } from "./pdf.js";

export async function getPageImage(docId: string, pageNumber: number, dpi: number): Promise<Buffer> {
  await ensureDir(pagesDir(docId));
  const file = join(pagesDir(docId), `page-${pageNumber}-${dpi}.png`);
  if (existsSync(file)) return readFile(file);
  const buffer = await renderPagePng(docId, sourcePdfPath(docId), pageNumber, dpi);
  await writeFile(file, buffer);
  return buffer;
}

export async function getNativeText(docId: string, pageNumber: number): Promise<NativeTextResult> {
  await ensureDir(nativeDir(docId));
  const file = join(nativeDir(docId), `page-${pageNumber}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf-8")) as NativeTextResult;
  const result = await extractNativeText(docId, sourcePdfPath(docId), pageNumber);
  await writeFile(file, JSON.stringify(result, null, 2), "utf-8");
  return result;
}

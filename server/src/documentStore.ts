import { existsSync } from "node:fs";
import { readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import type { CuratedPageRecord, DocumentMeta } from "@ttrpg-ocr-review/shared";
import { parseJsonlFile } from "./jsonl.js";
import { getPageCount } from "./pdf.js";
import {
  docDir,
  ensureDir,
  hashFile,
  jsonlCachePath,
  metaPath,
  sourcePdfPath,
  WORKSPACE_DIR,
} from "./paths.js";

interface CreateDocumentInput {
  // Paths to files multer already streamed to disk (TMP_DIR); this function
  // takes ownership of them (moves or deletes) rather than re-reading their
  // bytes into memory, so upload size isn't bounded by process memory.
  pdfTempPath: string;
  pdfFilename: string;
  jsonlTempPath: string | null;
  jsonlFilename: string | null;
}

export async function readMeta(docId: string): Promise<DocumentMeta | null> {
  const p = metaPath(docId);
  if (!existsSync(p)) return null;
  return JSON.parse(await readFile(p, "utf-8")) as DocumentMeta;
}

export async function createDocument(input: CreateDocumentInput): Promise<DocumentMeta> {
  const docId = await hashFile(input.pdfTempPath);
  await ensureDir(docDir(docId));

  const pdfPath = sourcePdfPath(docId);
  if (!existsSync(pdfPath)) {
    await rename(input.pdfTempPath, pdfPath);
  } else {
    // Same content already stored under this docId; discard the re-upload.
    await unlink(input.pdfTempPath).catch(() => {});
  }

  const pageCount = await getPageCount(docId, pdfPath);
  const existingMeta = await readMeta(docId);

  let jsonlFilename = existingMeta?.jsonlFilename ?? null;
  if (input.jsonlTempPath !== null) {
    const parsed = await parseJsonlFile(input.jsonlTempPath);
    await writeFile(
      jsonlCachePath(docId),
      JSON.stringify(Object.fromEntries(parsed), null, 2),
      "utf-8",
    );
    await unlink(input.jsonlTempPath).catch(() => {});
    jsonlFilename = input.jsonlFilename;
  }

  const meta: DocumentMeta = {
    id: docId,
    pdfFilename: input.pdfFilename,
    jsonlFilename,
    pageCount,
    createdAt: existingMeta?.createdAt ?? new Date().toISOString(),
  };
  await writeFile(metaPath(docId), JSON.stringify(meta, null, 2), "utf-8");
  return meta;
}

export async function listDocuments(): Promise<DocumentMeta[]> {
  await ensureDir(WORKSPACE_DIR);
  const ids = await readdir(WORKSPACE_DIR).catch(() => [] as string[]);
  const metas = await Promise.all(ids.map((id) => readMeta(id)));
  return metas
    .filter((m): m is DocumentMeta => m !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCuratedPage(
  docId: string,
  pageNumber: number,
): Promise<CuratedPageRecord | null> {
  const p = jsonlCachePath(docId);
  if (!existsSync(p)) return null;
  const obj = JSON.parse(await readFile(p, "utf-8")) as Record<string, CuratedPageRecord>;
  return obj[String(pageNumber)] ?? null;
}

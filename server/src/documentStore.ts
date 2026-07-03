import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import type { CuratedPageRecord, DocumentMeta } from "@ttrpg-ocr-review/shared";
import { parseJsonlContent } from "./jsonl.js";
import { getPageCount } from "./pdf.js";
import {
  docDir,
  ensureDir,
  hashBuffer,
  jsonlCachePath,
  metaPath,
  sourcePdfPath,
  WORKSPACE_DIR,
} from "./paths.js";

interface CreateDocumentInput {
  pdfBuffer: Buffer;
  pdfFilename: string;
  jsonlContent: string | null;
  jsonlFilename: string | null;
}

export async function readMeta(docId: string): Promise<DocumentMeta | null> {
  const p = metaPath(docId);
  if (!existsSync(p)) return null;
  return JSON.parse(await readFile(p, "utf-8")) as DocumentMeta;
}

export async function createDocument(input: CreateDocumentInput): Promise<DocumentMeta> {
  const docId = hashBuffer(input.pdfBuffer);
  await ensureDir(docDir(docId));

  const pdfPath = sourcePdfPath(docId);
  if (!existsSync(pdfPath)) {
    await writeFile(pdfPath, input.pdfBuffer);
  }

  const pageCount = await getPageCount(docId, pdfPath);
  const existingMeta = await readMeta(docId);

  let jsonlFilename = existingMeta?.jsonlFilename ?? null;
  if (input.jsonlContent !== null) {
    const parsed = parseJsonlContent(input.jsonlContent);
    await writeFile(
      jsonlCachePath(docId),
      JSON.stringify(Object.fromEntries(parsed), null, 2),
      "utf-8",
    );
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

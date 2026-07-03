import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { CuratedPageRecord } from "@ttrpg-ocr-review/shared";

// Malformed lines are skipped rather than failing the whole import, since
// exports can be hand-edited.
function parseJsonlLine(line: string): CuratedPageRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let record: CuratedPageRecord;
  try {
    record = JSON.parse(trimmed) as CuratedPageRecord;
  } catch {
    return null;
  }
  const pageNumber = record?.source?.page_number;
  if (typeof pageNumber !== "number") return null;
  return record;
}

// Parses a curated JSONL export (hitl_page_training_v1 shape from
// ttrpg-ocr-console, see docs/hitl-training-data.md there) into a map keyed
// by page number.
export function parseJsonlContent(content: string): Map<number, CuratedPageRecord> {
  const byPage = new Map<number, CuratedPageRecord>();
  for (const line of content.split(/\r?\n/)) {
    const record = parseJsonlLine(line);
    if (record) byPage.set(record.source.page_number, record);
  }
  return byPage;
}

// Same parsing, but line-by-line off disk so a large export never has to be
// held fully in memory as a single string.
export async function parseJsonlFile(filePath: string): Promise<Map<number, CuratedPageRecord>> {
  const byPage = new Map<number, CuratedPageRecord>();
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const record = parseJsonlLine(line);
    if (record) byPage.set(record.source.page_number, record);
  }
  return byPage;
}

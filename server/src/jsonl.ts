import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
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

function filterRecords(candidates: unknown[]): CuratedPageRecord[] {
  return candidates.filter(
    (c): c is CuratedPageRecord => typeof (c as CuratedPageRecord)?.source?.page_number === "number",
  );
}

// Not every export is true line-delimited JSONL — some tools produce a
// single pretty-printed JSON array, or an object wrapping one (e.g.
// { "pages": [...] }). Tolerate those shapes too rather than silently
// extracting zero records.
function extractRecordsFromParsedJson(parsed: unknown): CuratedPageRecord[] {
  if (Array.isArray(parsed)) return filterRecords(parsed);
  if (parsed && typeof parsed === "object") {
    const direct = filterRecords(Object.values(parsed as Record<string, unknown>));
    if (direct.length > 0) return direct;
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        const nested = filterRecords(value);
        if (nested.length > 0) return nested;
      }
    }
  }
  return [];
}

function parseWholeDocument(content: string): Map<number, CuratedPageRecord> {
  const byPage = new Map<number, CuratedPageRecord>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return byPage;
  }
  for (const record of extractRecordsFromParsedJson(parsed)) {
    byPage.set(record.source.page_number, record);
  }
  return byPage;
}

// Parses a curated JSONL export (hitl_page_training_v1 shape from
// ttrpg-ocr-console, see docs/hitl-training-data.md there) into a map keyed
// by page number. Falls back to whole-document JSON parsing (see above) if
// line-by-line parsing finds nothing.
export function parseJsonlContent(content: string): Map<number, CuratedPageRecord> {
  const byPage = new Map<number, CuratedPageRecord>();
  for (const line of content.split(/\r?\n/)) {
    const record = parseJsonlLine(line);
    if (record) byPage.set(record.source.page_number, record);
  }
  if (byPage.size > 0) return byPage;
  return parseWholeDocument(content);
}

// Same parsing, but line-by-line off disk so a large export never has to be
// held fully in memory as a single string — except in the whole-document
// fallback case, which by definition isn't line-delimited and has to be
// read in full to be parsed as JSON at all.
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
  if (byPage.size > 0) return byPage;
  const content = await readFile(filePath, "utf-8");
  return parseWholeDocument(content);
}

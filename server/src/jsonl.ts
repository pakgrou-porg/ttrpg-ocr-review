import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import parserStream from "stream-json";
import { pick } from "stream-json/filters/pick.js";
import { streamArray } from "stream-json/streamers/stream-array.js";
import { streamObject } from "stream-json/streamers/stream-object.js";
import type { CuratedPageRecord, CuratedRegion } from "@ttrpg-ocr-review/shared";

// ---- record shape normalization --------------------------------------------
// Two export shapes are supported: ttrpg-ocr-console's curated HITL
// training-data export (hitl_page_training_v1, one flat record per page,
// docs/hitl-training-data.md there) and its full document-bundle export
// (bundle_v1, a `pages[]` array with page-level fields and nested OCR/region
// data). Both get normalized into the same CuratedPageRecord shape.

function asRegion(raw: unknown, index: number): CuratedRegion | null {
  const r = raw as Record<string, unknown> | null;
  const bbox = r?.bbox as Record<string, unknown> | undefined;
  if (
    !bbox ||
    typeof bbox.x !== "number" ||
    typeof bbox.y !== "number" ||
    typeof bbox.w !== "number" ||
    typeof bbox.h !== "number"
  ) {
    return null;
  }
  const type = typeof r?.type === "string" ? (r.type as string) : undefined;
  return {
    sequence: typeof r?.sequence === "number" ? (r.sequence as number) : index + 1,
    type,
    regionType: typeof r?.regionType === "string" ? (r.regionType as string) : type,
    bbox: { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h },
  };
}

function asRegions(raw: unknown): CuratedRegion[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const regions = raw.map(asRegion).filter((r): r is CuratedRegion => r !== null);
  return regions.length > 0 ? regions : undefined;
}

function sanitizeHitlRecord(r: Record<string, unknown>): CuratedPageRecord | null {
  const source = r.source as Record<string, unknown> | undefined;
  const pageNumber = source?.page_number;
  if (typeof pageNumber !== "number") return null;
  const labels = (r.labels as Record<string, unknown> | undefined) ?? {};
  return {
    schema_version: typeof r.schema_version === "string" ? r.schema_version : undefined,
    source: {
      document_id: source?.document_id as number | undefined,
      document_title: source?.document_title as string | undefined,
      page_number: pageNumber,
      image_width: source?.image_width as number | undefined,
      image_height: source?.image_height as number | undefined,
    },
    review: (r.review as CuratedPageRecord["review"]) ?? null,
    labels: {
      page_layout: labels.page_layout as CuratedPageRecord["labels"]["page_layout"],
      regions: asRegions(labels.regions),
      ocr_text: typeof labels.ocr_text === "string" ? labels.ocr_text : undefined,
      ocr_structured: labels.ocr_structured,
    },
  };
}

// Bundle export: page number under `pageNumber`, regions under the
// top-level `contentRegions` (falling back to `pageJsonOutput.content_regions`
// only if absent). Top-level entries carry a `reviewId` for HITL-corrected
// boxes and are the ones Chronicles renders, so they're the authoritative
// source; pageJsonOutput.content_regions is the earlier pipeline-stage
// snapshot before human correction. OCR text nested under `ocr.*`.
function sanitizeBundleRecord(r: Record<string, unknown>): CuratedPageRecord | null {
  const pageNumber = r.pageNumber;
  if (typeof pageNumber !== "number") return null;
  const pageJsonOutput = r.pageJsonOutput as Record<string, unknown> | undefined;
  const layout = pageJsonOutput?.layout as Record<string, unknown> | undefined;
  const regions = asRegions(r.contentRegions) ?? asRegions(pageJsonOutput?.content_regions);
  const ocr = r.ocr as Record<string, unknown> | undefined;
  const ocrText = [ocr?.markdownText, ocr?.normalisedText, ocr?.rawText].find(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  return {
    source: {
      page_number: pageNumber,
      image_width: r.imageWidth as number | undefined,
      image_height: r.imageHeight as number | undefined,
    },
    labels: {
      page_layout: {
        layout_type: (r.layoutType as string | undefined) ?? (layout?.layout_type as string | undefined),
        columns: layout?.columns as number | undefined,
      },
      regions,
      ocr_text: ocrText,
    },
  };
}

function sanitizeRecord(raw: unknown): CuratedPageRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return sanitizeHitlRecord(r) ?? sanitizeBundleRecord(r);
}

// ---- line-delimited parsing -------------------------------------------------

function parseJsonlLine(line: string): CuratedPageRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return sanitizeRecord(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

// ---- whole-document fallback (small strings only — see parseJsonlFile for
// the streaming version used on real uploads) --------------------------------

function filterRecords(candidates: unknown[]): CuratedPageRecord[] {
  return candidates.map(sanitizeRecord).filter((r): r is CuratedPageRecord => r !== null);
}

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

// True JSONL should parse the large majority of its non-blank lines. A low
// hit rate — e.g. exactly one coincidentally-valid line, which happens for
// pretty-printed/compact-per-item JSON where by chance one line (often the
// last, lacking a trailing comma) is valid standalone JSON on its own —
// means this isn't really JSONL, and a partial line-based result would be
// misleadingly incomplete rather than genuinely empty. Prefer the
// whole-document parse in that case.
function isReliableLineParse(attempted: number, parsedCount: number): boolean {
  return attempted > 0 && parsedCount / attempted >= 0.5;
}

// Parses a curated export into a map keyed by page number. Tries true
// line-delimited JSONL first; if that doesn't look reliable, falls back to
// treating the content as one JSON document (an array of records, or an
// object wrapping/keyed by one).
export function parseJsonlContent(content: string): Map<number, CuratedPageRecord> {
  const byPage = new Map<number, CuratedPageRecord>();
  let attempted = 0;
  let parsedCount = 0;
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    attempted++;
    const record = parseJsonlLine(line);
    if (record) {
      parsedCount++;
      byPage.set(record.source.page_number, record);
    }
  }
  if (isReliableLineParse(attempted, parsedCount)) return byPage;
  return parseWholeDocument(content);
}

// ---- streaming file parsing ---------------------------------------------

// Streams a top-level JSON array so individual elements are parsed one at a
// time rather than materializing the whole array up front.
async function streamTopLevelArray(filePath: string): Promise<Map<number, CuratedPageRecord>> {
  const byPage = new Map<number, CuratedPageRecord>();
  const arr = streamArray.withParserAsStream();
  arr.on("data", ({ value }: { value: unknown }) => {
    const record = sanitizeRecord(value);
    if (record) byPage.set(record.source.page_number, record);
  });
  await pipeline(createReadStream(filePath), arr);
  return byPage;
}

// Streams every top-level array found in a wrapper object (e.g.
// { document: {...}, pages: [...] }), one element at a time, without
// knowing the array's key name in advance and without ever materializing
// a whole top-level property at once. That last part matters: piping
// through streamObject and reading its assembled `value` for the array
// property works for modest files, but silently corrupts (drops all but
// the last element of) very large arrays — piping through Pick + streamArray
// instead keeps peak memory to a single element, and was verified correct
// against a real ~640MB fixture where the streamObject approach was not.
// node:stream/promises pipeline() attaches error handlers to every stage
// so an error in parserStream or pick doesn't become an unhandled event.
async function streamTopLevelArrays(filePath: string): Promise<Map<number, CuratedPageRecord>> {
  const byPage = new Map<number, CuratedPageRecord>();
  const parser = parserStream();
  const picker = pick.asStream({ filter: (stack: unknown[], chunk: { name: string }) => stack.length === 1 && chunk.name === "startArray" });
  const arr = streamArray.asStream();
  arr.on("data", ({ value }: { value: unknown }) => {
    const record = sanitizeRecord(value);
    if (record) byPage.set(record.source.page_number, record);
  });
  await pipeline(createReadStream(filePath), parser, picker, arr);
  return byPage;
}

// Fallback for wrapper objects with no top-level array (e.g. an object
// keyed by page id: {"1": {...}, "2": {...}}) — each top-level property
// here is a single record, not a bulky array, so the streamObject
// materialize-per-property approach is safe.
async function streamTopLevelObjectValues(filePath: string): Promise<Map<number, CuratedPageRecord>> {
  const byPage = new Map<number, CuratedPageRecord>();
  const obj = streamObject.withParserAsStream();
  obj.on("data", ({ value }: { key: string; value: unknown }) => {
    const record = sanitizeRecord(value);
    if (record) byPage.set(record.source.page_number, record);
  });
  await pipeline(createReadStream(filePath), obj);
  return byPage;
}

async function streamTopLevelObject(filePath: string): Promise<Map<number, CuratedPageRecord>> {
  const fromArrays = await streamTopLevelArrays(filePath);
  if (fromArrays.size > 0) return fromArrays;
  return streamTopLevelObjectValues(filePath);
}

// Peeks the first non-whitespace character without reading the file in full,
// to pick which top-level shape to stream.
function peekFirstChar(filePath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: "utf-8", start: 0, end: 4095 });
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk;
    });
    stream.on("end", () => resolve(buf.trimStart().at(0) ?? null));
    stream.on("error", reject);
  });
}

// Same parsing as parseJsonlContent, but line-by-line off disk so a large
// export never has to be held fully in memory as a single string — and if
// it isn't line-delimited, streamed as JSON tokens instead of read into one
// string, since a bundled export with embedded images can be large enough
// to exceed V8's string length limit (~536M characters).
export async function parseJsonlFile(filePath: string): Promise<Map<number, CuratedPageRecord>> {
  const byPage = new Map<number, CuratedPageRecord>();
  let attempted = 0;
  let parsedCount = 0;
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    attempted++;
    const record = parseJsonlLine(line);
    if (record) {
      parsedCount++;
      byPage.set(record.source.page_number, record);
    }
  }
  if (isReliableLineParse(attempted, parsedCount)) return byPage;

  const firstChar = await peekFirstChar(filePath);
  if (firstChar === "[") return streamTopLevelArray(filePath);
  if (firstChar === "{") return streamTopLevelObject(filePath);
  return byPage;
}

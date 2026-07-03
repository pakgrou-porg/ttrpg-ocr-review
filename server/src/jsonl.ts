import type { CuratedPageRecord } from "@ttrpg-ocr-review/shared";

// Parses a curated JSONL export (hitl_page_training_v1 shape from
// ttrpg-ocr-console, see docs/hitl-training-data.md there) into a map keyed
// by page number. Malformed lines are skipped rather than failing the whole
// import, since exports can be hand-edited.
export function parseJsonlContent(content: string): Map<number, CuratedPageRecord> {
  const byPage = new Map<number, CuratedPageRecord>();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record: CuratedPageRecord;
    try {
      record = JSON.parse(trimmed) as CuratedPageRecord;
    } catch {
      continue;
    }
    const pageNumber = record?.source?.page_number;
    if (typeof pageNumber !== "number") continue;
    byPage.set(pageNumber, record);
  }
  return byPage;
}

// Region bbox is always normalized to 0-100 percentage space (matches the
// reference project's overlay convention), independent of the rendered
// image's pixel dimensions.
export interface RegionBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CuratedRegion {
  sequence: number;
  type?: string;
  regionType?: string;
  bbox: RegionBbox;
}

// Mirrors the `hitl_page_training_v1` export shape from ttrpg-ocr-console
// (docs/hitl-training-data.md), trimmed to the fields this tool reads.
export interface CuratedPageRecord {
  schema_version?: string;
  source: {
    document_id?: number;
    document_title?: string;
    page_number: number;
    image_width?: number;
    image_height?: number;
  };
  review?: {
    hitl_id?: number;
    status?: string;
    priority?: string;
    reason?: string;
  } | null;
  labels: {
    page_layout?: { layout_type?: string; columns?: number };
    regions?: CuratedRegion[];
    ocr_text?: string;
    ocr_structured?: unknown;
  };
}

export interface NativeTextResult {
  pageNumber: number;
  hasEmbeddedText: boolean;
  text: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiPrefix: string;
  apiKey?: string;
  model: string;
  isOpenRouter: boolean;
  supportsVision: boolean;
}

export interface ProviderConfigInput {
  name: string;
  baseUrl: string;
  apiPrefix?: string;
  apiKey?: string;
  model: string;
  isOpenRouter?: boolean;
  supportsVision?: boolean;
}

export type PublicProviderConfig = Omit<ProviderConfig, "apiKey"> & { hasApiKey: boolean };

export interface AppSettings {
  activeProviderId: string | null;
  ocrPrompt: string;
  comparisonPrompt: string;
  includeRegionsHintDefault: boolean;
  renderDpi: number;
}

export interface DocumentMeta {
  id: string;
  pdfFilename: string;
  jsonlFilename: string | null;
  pageCount: number;
  // Number of pages the JSONL export actually yielded curated records for
  // (null if no JSONL has ever been loaded for this document). 0 with a
  // non-null jsonlFilename means the file was accepted but nothing could be
  // parsed from it — surfaced as a warning rather than failing silently.
  curatedPageCount: number | null;
  createdAt: string;
}

export interface UnlimitedOcrResult {
  pageNumber: number;
  providerId: string;
  providerName: string;
  model: string;
  prompt: string;
  includeRegionsHint: boolean;
  text: string;
  latencyMs: number;
  createdAt: string;
  cached: boolean;
}

export interface ComparisonResult {
  pageNumber: number;
  providerId: string;
  providerName: string;
  model: string;
  text: string;
  latencyMs: number;
  createdAt: string;
  cached: boolean;
}

export const DEFAULT_OCR_PROMPT =
  "Transcribe every word of text visible on this page image, in reading order across columns. " +
  "Preserve paragraph breaks.\n\n" +
  "If the page contains a table or a stat block with aligned columns, reproduce it as a markdown " +
  "table so the row/column structure is preserved.\n\n" +
  "If the page contains a photo, illustration, map, or other non-text figure, note it inline as " +
  '"[IMAGE: brief description]" instead of skipping it.\n\n' +
  "Do not summarize, translate, or omit anything. Output plain text (with markdown tables where " +
  "applicable) only, no commentary.";

// The instruction/rubric only — the actual curated region summary and the
// Unlimited-OCR text being judged are appended as separate message content
// server-side (see server/src/ocr.ts buildCuratedComparisonContext), the
// same way includeRegionsHint appends region data to the OCR prompt.
export const DEFAULT_COMPARISON_PROMPT =
  "You are comparing two independent records of the same page: a curated, human-reviewed " +
  "extraction (with page layout and labeled regions) and a fresh transcription from another OCR " +
  "pass called Unlimited-OCR, produced without knowledge of the curated one.\n\n" +
  "Compare them against the page image and report on:\n" +
  "1. Text completeness — does Unlimited-OCR cover everything the curated pipeline captured? " +
  "Note anything missing, extra, or altered.\n" +
  "2. Images/figures — for each image/art region the curated pipeline identified, does " +
  "Unlimited-OCR acknowledge it, or silently skip it?\n" +
  "3. Tables/tabular data — for each table or stat-block region, does Unlimited-OCR preserve " +
  "row/column alignment well enough to reconstruct the table, or is it flattened or scrambled?\n" +
  "4. Reading order — does Unlimited-OCR follow the same reading order as the curated region " +
  "sequence, especially across multi-column layouts?\n\n" +
  "End with a one-line verdict: is Unlimited-OCR a safe substitute for the curated pipeline on " +
  "this page, or not, and why.";

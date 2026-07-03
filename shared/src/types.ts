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
  includeRegionsHintDefault: boolean;
  renderDpi: number;
}

export interface DocumentMeta {
  id: string;
  pdfFilename: string;
  jsonlFilename: string | null;
  pageCount: number;
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

export const DEFAULT_OCR_PROMPT =
  "Transcribe every word of text visible on this page image, in reading order. " +
  "Preserve paragraph breaks. Do not summarize, translate, or omit anything. " +
  "Output plain text only, no commentary.";

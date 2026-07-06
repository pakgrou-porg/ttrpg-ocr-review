import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ComparisonResult,
  CuratedPageRecord,
  LlmInteraction,
  LlmInteractionMessage,
  ProviderConfig,
  UnlimitedOcrResult,
} from "@ttrpg-ocr-review/shared";
import { comparisonsDir, ensureDir, ocrRunsDir } from "./paths.js";

const MAX_INTERACTIONS = 50;
const interactionLog: LlmInteraction[] = [];

function pushInteraction(entry: LlmInteraction) {
  interactionLog.push(entry);
  if (interactionLog.length > MAX_INTERACTIONS) interactionLog.shift();
}

export function getInteractions(): LlmInteraction[] {
  return [...interactionLog].reverse();
}

function summariseContent(content: Array<Record<string, unknown>>): LlmInteractionMessage[] {
  return content.map((c) => {
    if (c.type === "text") return { role: "user", content: c.text as string };
    if (c.type === "image_url") return { role: "user", content: "[IMAGE: base64 PNG]" };
    return { role: "user", content: JSON.stringify(c).slice(0, 200) };
  });
}

export function buildRegionsHintText(curated: CuratedPageRecord | null): string {
  const regions = curated?.labels?.regions;
  if (!regions?.length) return "";
  const lines = regions
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map(
      (r) =>
        `- ${r.regionType ?? r.type ?? "region"} at (${r.bbox.x.toFixed(0)},${r.bbox.y.toFixed(0)}) ${r.bbox.w.toFixed(0)}x${r.bbox.h.toFixed(0)} (percent of page)`,
    );
  return `Known page regions, for reference only:\n${lines.join("\n")}`;
}

const TABLE_LIKE_TYPES = new Set(["table", "stat_block", "statblock"]);
const IMAGE_LIKE_TYPES = new Set(["image", "art", "figure", "illustration", "map", "graphic"]);

// Full context for the comparison judge: layout + every region (with an
// explicit image/table count, since those are the two structural failure
// modes a plain-text OCR pass is most likely to get wrong) + the curated
// pipeline's own OCR text.
export function buildCuratedComparisonContext(curated: CuratedPageRecord | null): string {
  if (!curated) return "No curated record exists for this page.";
  const regions = (curated.labels.regions ?? []).slice().sort((a, b) => a.sequence - b.sequence);
  const imageCount = regions.filter((r) => IMAGE_LIKE_TYPES.has((r.regionType ?? r.type ?? "").toLowerCase())).length;
  const tableCount = regions.filter((r) => TABLE_LIKE_TYPES.has((r.regionType ?? r.type ?? "").toLowerCase())).length;

  const lines = [
    `Layout type: ${curated.labels.page_layout?.layout_type ?? "unknown"}${curated.labels.page_layout?.columns ? `, ${curated.labels.page_layout.columns} column(s)` : ""}`,
    `Regions (${regions.length} total, ${imageCount} image/figure, ${tableCount} table/stat-block), in reading order:`,
    ...regions.map((r) => `  ${r.sequence}. ${r.regionType ?? r.type ?? "region"}`),
    "",
    "Curated pipeline OCR text:",
    '"""',
    curated.labels.ocr_text || "(none captured)",
    '"""',
  ];
  return lines.join("\n");
}

function hashParts(...parts: string[]): string {
  return createHash("sha256").update(parts.join("::")).digest("hex").slice(0, 12);
}

export function promptHash(prompt: string, includeRegionsHint: boolean, regionsSummary: string): string {
  return hashParts(prompt, String(includeRegionsHint), regionsSummary);
}

async function readCache<T>(file: string): Promise<T | null> {
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, "utf-8")) as T;
}

interface ChatResponse {
  text: string;
  latencyMs: number;
}

// Vision inference on local hardware can be slow, but it shouldn't hang the
// request indefinitely — undici's default header timeout is ~5 minutes,
// which just leaves the UI stuck with no feedback. Fail clearly instead.
const CHAT_TIMEOUT_MS = 120_000;

interface InteractionMeta {
  type: "ocr" | "comparison";
  docId: string;
  pageNumber: number;
}

async function callVisionChat(
  provider: ProviderConfig,
  content: Array<Record<string, unknown>>,
  meta: InteractionMeta,
): Promise<ChatResponse> {
  const url = `${provider.baseUrl}${provider.apiPrefix}/chat/completions`;
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0,
        max_tokens: 8192,
        repetition_penalty: 1.05,
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error(`Provider did not respond within ${CHAT_TIMEOUT_MS / 1000}s.`);
    }
    throw err;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Provider request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content ?? "";
  const latencyMs = Date.now() - started;

  pushInteraction({
    id: randomUUID(),
    type: meta.type,
    timestamp: new Date().toISOString(),
    docId: meta.docId,
    pageNumber: meta.pageNumber,
    providerName: provider.name,
    model: provider.model,
    messages: summariseContent(content),
    responseText: text,
    latencyMs,
    cached: false,
  });

  return { text, latencyMs };
}

interface RunOcrInput {
  docId: string;
  pageNumber: number;
  provider: ProviderConfig;
  prompt: string;
  includeRegionsHint: boolean;
  curated: CuratedPageRecord | null;
  imagePng: Buffer;
  forceRerun?: boolean;
}

export async function runUnlimitedOcr(input: RunOcrInput): Promise<UnlimitedOcrResult> {
  const regionsSummary = input.includeRegionsHint ? buildRegionsHintText(input.curated) : "";
  const hash = promptHash(input.prompt, input.includeRegionsHint, regionsSummary);
  await ensureDir(ocrRunsDir(input.docId));
  const file = join(ocrRunsDir(input.docId), `page-${input.pageNumber}-${input.provider.id}-${hash}.json`);

  if (!input.forceRerun) {
    const cached = await readCache<UnlimitedOcrResult>(file);
    if (cached) return { ...cached, cached: true };
  }

  const content: Array<Record<string, unknown>> = [{ type: "text", text: input.prompt }];
  if (regionsSummary) content.push({ type: "text", text: regionsSummary });
  content.push({
    type: "image_url",
    image_url: { url: `data:image/png;base64,${input.imagePng.toString("base64")}` },
  });

  const { text, latencyMs } = await callVisionChat(input.provider, content, {
    type: "ocr",
    docId: input.docId,
    pageNumber: input.pageNumber,
  });

  const result: UnlimitedOcrResult = {
    pageNumber: input.pageNumber,
    providerId: input.provider.id,
    providerName: input.provider.name,
    model: input.provider.model,
    prompt: input.prompt,
    includeRegionsHint: input.includeRegionsHint,
    text,
    latencyMs,
    createdAt: new Date().toISOString(),
    cached: false,
  };
  await writeFile(file, JSON.stringify(result, null, 2), "utf-8");
  return result;
}

interface RunComparisonInput {
  docId: string;
  pageNumber: number;
  provider: ProviderConfig;
  comparisonPrompt: string;
  curated: CuratedPageRecord | null;
  unlimitedOcrText: string;
  imagePng: Buffer;
  forceRerun?: boolean;
}

// Judges the Unlimited-OCR text against the curated pipeline's regions/OCR,
// with the page image included so the model can verify claims (an image
// region really is a figure, a table really is misaligned) rather than
// trusting either text blindly.
export async function runComparison(input: RunComparisonInput): Promise<ComparisonResult> {
  const curatedContext = buildCuratedComparisonContext(input.curated);
  const hash = hashParts(input.comparisonPrompt, curatedContext, input.unlimitedOcrText);
  await ensureDir(comparisonsDir(input.docId));
  const file = join(comparisonsDir(input.docId), `page-${input.pageNumber}-${input.provider.id}-${hash}.json`);

  if (!input.forceRerun) {
    const cached = await readCache<ComparisonResult>(file);
    if (cached) return { ...cached, cached: true };
  }

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: input.comparisonPrompt },
    { type: "text", text: `Curated pipeline record:\n${curatedContext}` },
    { type: "text", text: `Unlimited-OCR transcription:\n"""\n${input.unlimitedOcrText || "(empty)"}\n"""` },
    { type: "image_url", image_url: { url: `data:image/png;base64,${input.imagePng.toString("base64")}` } },
  ];

  const { text, latencyMs } = await callVisionChat(input.provider, content, {
    type: "comparison",
    docId: input.docId,
    pageNumber: input.pageNumber,
  });

  const result: ComparisonResult = {
    pageNumber: input.pageNumber,
    providerId: input.provider.id,
    providerName: input.provider.name,
    model: input.provider.model,
    text,
    latencyMs,
    createdAt: new Date().toISOString(),
    cached: false,
  };
  await writeFile(file, JSON.stringify(result, null, 2), "utf-8");
  return result;
}

interface ListModelsInput {
  baseUrl: string;
  apiPrefix?: string;
  apiKey?: string;
}

export async function listModels(
  input: ListModelsInput,
): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  try {
    const url = `${input.baseUrl}${input.apiPrefix?.trim() || "/v1"}/models`;
    const res = await fetch(url, {
      headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {},
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = Array.isArray(json.data)
      ? json.data.map((m) => m.id).filter((id): id is string => Boolean(id))
      : [];
    return { ok: true, models };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, error: "Provider did not respond within 15s." };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function testProviderConnection(
  provider: ProviderConfig,
): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  return listModels(provider);
}

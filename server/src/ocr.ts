import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CuratedPageRecord, ProviderConfig, UnlimitedOcrResult } from "@ttrpg-ocr-review/shared";
import { ensureDir, ocrRunsDir } from "./paths.js";

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

export function promptHash(prompt: string, includeRegionsHint: boolean, regionsSummary: string): string {
  return createHash("sha256")
    .update(`${prompt}::${includeRegionsHint}::${regionsSummary}`)
    .digest("hex")
    .slice(0, 12);
}

function cacheFile(docId: string, pageNumber: number, providerId: string, hash: string): string {
  return join(ocrRunsDir(docId), `page-${pageNumber}-${providerId}-${hash}.json`);
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
  const file = cacheFile(input.docId, input.pageNumber, input.provider.id, hash);

  if (!input.forceRerun && existsSync(file)) {
    const cached = JSON.parse(await readFile(file, "utf-8")) as UnlimitedOcrResult;
    return { ...cached, cached: true };
  }

  const userContent: Array<Record<string, unknown>> = [{ type: "text", text: input.prompt }];
  if (regionsSummary) userContent.push({ type: "text", text: regionsSummary });
  userContent.push({
    type: "image_url",
    image_url: { url: `data:image/png;base64,${input.imagePng.toString("base64")}` },
  });

  const url = `${input.provider.baseUrl}${input.provider.apiPrefix}/chat/completions`;
  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.provider.apiKey ? { Authorization: `Bearer ${input.provider.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: input.provider.model,
      temperature: 0,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Provider request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  const latencyMs = Date.now() - started;

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

export async function testProviderConnection(
  provider: ProviderConfig,
): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  try {
    const url = `${provider.baseUrl}${provider.apiPrefix}/models`;
    const res = await fetch(url, {
      headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {},
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = Array.isArray(json.data)
      ? json.data.map((m) => m.id).filter((id): id is string => Boolean(id))
      : [];
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

import { unlink } from "node:fs/promises";
import { Router, type Request } from "express";
import multer from "multer";
import type { AppSettings, ProviderConfig } from "@ttrpg-ocr-review/shared";
import { createDocument, getCuratedPage, listDocuments, readMeta } from "../documentStore.js";
import { getNativeText, getPageImage } from "../pageCache.js";
import { getProvider, getSettings } from "../config.js";
import { runComparison, runUnlimitedOcr } from "../ocr.js";
import { ensureDir, TMP_DIR } from "../paths.js";

await ensureDir(TMP_DIR);

// Streams uploads straight to disk (TMP_DIR) instead of buffering the whole
// file in process memory — scanned rulebook PDFs can be large. 1GB is a
// generous ceiling for a local single-user tool.
const upload = multer({
  storage: multer.diskStorage({ destination: TMP_DIR }),
  limits: { fileSize: 1024 * 1024 * 1024 },
});

const router = Router();

// Shared by the unlimited-ocr and compare routes: pick the requested
// provider, falling back to the configured active one.
async function resolveProvider(
  requestedId: string | undefined,
  settings: AppSettings,
): Promise<{ provider: ProviderConfig } | { error: string; status: number }> {
  const providerId = requestedId ?? settings.activeProviderId ?? undefined;
  if (!providerId) {
    return { error: "No provider configured. Add one in Settings first.", status: 400 };
  }
  const provider = await getProvider(providerId);
  if (!provider) {
    return { error: "Provider not found", status: 404 };
  }
  return { provider };
}

router.get("/", async (_req, res) => {
  res.json(await listDocuments());
});

router.post(
  "/",
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "jsonl", maxCount: 1 },
  ]),
  async (req: Request, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const pdfFile = files?.pdf?.[0];
    const jsonlFile = files?.jsonl?.[0];
    if (!pdfFile) {
      if (jsonlFile) await unlink(jsonlFile.path).catch(() => {});
      res.status(400).json({ error: "A PDF file is required." });
      return;
    }
    const meta = await createDocument({
      pdfTempPath: pdfFile.path,
      pdfFilename: pdfFile.originalname,
      jsonlTempPath: jsonlFile ? jsonlFile.path : null,
      jsonlFilename: jsonlFile ? jsonlFile.originalname : null,
    });
    res.status(201).json(meta);
  },
);

router.get("/:id", async (req, res) => {
  const meta = await readMeta(req.params.id);
  if (!meta) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json(meta);
});

router.get("/:id/pages/:n/image", async (req, res) => {
  const meta = await readMeta(req.params.id);
  if (!meta) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const settings = await getSettings();
  const buffer = await getPageImage(req.params.id, Number(req.params.n), settings.renderDpi);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(buffer);
});

router.get("/:id/pages/:n/native-text", async (req, res) => {
  const meta = await readMeta(req.params.id);
  if (!meta) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json(await getNativeText(req.params.id, Number(req.params.n)));
});

router.get("/:id/pages/:n/curated", async (req, res) => {
  res.json(await getCuratedPage(req.params.id, Number(req.params.n)));
});

router.post("/:id/pages/:n/unlimited-ocr", async (req, res) => {
  const meta = await readMeta(req.params.id);
  if (!meta) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const pageNumber = Number(req.params.n);
  const settings = await getSettings();
  const resolved = await resolveProvider(req.body?.providerId, settings);
  if ("error" in resolved) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }

  const prompt: string = req.body?.prompt ?? settings.ocrPrompt;
  const includeRegionsHint: boolean = req.body?.includeRegionsHint ?? settings.includeRegionsHintDefault;
  const curated = includeRegionsHint ? await getCuratedPage(req.params.id, pageNumber) : null;
  const imagePng = await getPageImage(req.params.id, pageNumber, settings.renderDpi);

  const result = await runUnlimitedOcr({
    docId: req.params.id,
    pageNumber,
    provider: resolved.provider,
    prompt,
    includeRegionsHint,
    curated,
    imagePng,
    forceRerun: Boolean(req.body?.forceRerun),
  });
  res.json(result);
});

router.post("/:id/pages/:n/compare", async (req, res) => {
  const meta = await readMeta(req.params.id);
  if (!meta) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const pageNumber = Number(req.params.n);
  // An empty string is a legitimate (if degenerate) OCR result — worth
  // comparing, since "produced nothing" is itself a real finding. Only a
  // genuinely missing field means OCR was never run.
  const unlimitedOcrText: string | undefined = req.body?.unlimitedOcrText;
  if (typeof unlimitedOcrText !== "string") {
    res.status(400).json({ error: "Run Unlimited-OCR for this page first." });
    return;
  }
  const curated = await getCuratedPage(req.params.id, pageNumber);
  if (!curated) {
    res.status(400).json({ error: "No curated JSONL data for this page to compare against." });
    return;
  }

  const settings = await getSettings();
  const resolved = await resolveProvider(req.body?.providerId, settings);
  if ("error" in resolved) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }

  const comparisonPrompt: string = req.body?.comparisonPrompt ?? settings.comparisonPrompt;
  const imagePng = await getPageImage(req.params.id, pageNumber, settings.renderDpi);

  const result = await runComparison({
    docId: req.params.id,
    pageNumber,
    provider: resolved.provider,
    comparisonPrompt,
    curated,
    unlimitedOcrText,
    imagePng,
    forceRerun: Boolean(req.body?.forceRerun),
  });
  res.json(result);
});

export default router;

import { Router } from "express";
import type { ProviderConfig, PublicProviderConfig } from "@ttrpg-ocr-review/shared";
import {
  createProvider,
  deleteProvider,
  getProvider,
  listProviders,
  updateProvider,
} from "../config.js";
import { listModels, testProviderConnection } from "../ocr.js";

const router = Router();

function toPublic(p: ProviderConfig): PublicProviderConfig {
  const { apiKey, ...rest } = p;
  return { ...rest, hasApiKey: Boolean(apiKey) };
}

router.get("/", async (_req, res) => {
  res.json((await listProviders()).map(toPublic));
});

// Lets the add-provider form discover models before the provider is saved.
router.post("/discover-models", async (req, res) => {
  const { baseUrl, apiPrefix, apiKey } = req.body ?? {};
  if (!baseUrl) {
    res.status(400).json({ ok: false, error: "baseUrl is required" });
    return;
  }
  res.json(await listModels({ baseUrl, apiPrefix, apiKey }));
});

router.post("/", async (req, res) => {
  const provider = await createProvider(req.body ?? {});
  res.status(201).json(toPublic(provider));
});

router.put("/:id", async (req, res) => {
  const provider = await updateProvider(req.params.id, req.body ?? {});
  if (!provider) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }
  res.json(toPublic(provider));
});

router.delete("/:id", async (req, res) => {
  await deleteProvider(req.params.id);
  res.status(204).send();
});

router.post("/:id/test", async (req, res) => {
  const provider = await getProvider(req.params.id);
  if (!provider) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }
  res.json(await testProviderConnection(provider));
});

export default router;

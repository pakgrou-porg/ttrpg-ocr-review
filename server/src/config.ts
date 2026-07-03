import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { nanoid } from "nanoid";
import {
  DEFAULT_OCR_PROMPT,
  type AppSettings,
  type ProviderConfig,
  type ProviderConfigInput,
} from "@ttrpg-ocr-review/shared";
import { APP_DIR, CONFIG_PATH, ensureDir } from "./paths.js";

interface StoredConfig {
  providers: ProviderConfig[];
  settings: AppSettings;
}

function defaultConfig(): StoredConfig {
  return {
    providers: [],
    settings: {
      activeProviderId: null,
      ocrPrompt: DEFAULT_OCR_PROMPT,
      includeRegionsHintDefault: false,
      renderDpi: 150,
    },
  };
}

let cache: StoredConfig | null = null;

async function persist(): Promise<void> {
  if (!cache) return;
  await ensureDir(APP_DIR);
  await writeFile(CONFIG_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

async function load(): Promise<StoredConfig> {
  if (cache) return cache;
  await ensureDir(APP_DIR);
  if (!existsSync(CONFIG_PATH)) {
    cache = defaultConfig();
    await persist();
    return cache;
  }
  const raw = await readFile(CONFIG_PATH, "utf-8");
  const parsed = JSON.parse(raw) as Partial<StoredConfig>;
  const defaults = defaultConfig();
  cache = {
    providers: parsed.providers ?? defaults.providers,
    settings: { ...defaults.settings, ...parsed.settings },
  };
  return cache;
}

export async function getSettings(): Promise<AppSettings> {
  return (await load()).settings;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const cfg = await load();
  cfg.settings = { ...cfg.settings, ...patch };
  await persist();
  return cfg.settings;
}

export async function listProviders(): Promise<ProviderConfig[]> {
  return (await load()).providers;
}

export async function getProvider(id: string): Promise<ProviderConfig | undefined> {
  return (await load()).providers.find((p) => p.id === id);
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export async function createProvider(input: ProviderConfigInput): Promise<ProviderConfig> {
  const cfg = await load();
  const provider: ProviderConfig = {
    id: nanoid(10),
    name: input.name,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    apiPrefix: input.apiPrefix?.trim() || "/v1",
    apiKey: input.apiKey,
    model: input.model,
    isOpenRouter: input.isOpenRouter ?? false,
    supportsVision: input.supportsVision ?? true,
  };
  cfg.providers.push(provider);
  if (!cfg.settings.activeProviderId) cfg.settings.activeProviderId = provider.id;
  await persist();
  return provider;
}

export async function updateProvider(
  id: string,
  patch: Partial<ProviderConfigInput>,
): Promise<ProviderConfig | undefined> {
  const cfg = await load();
  const provider = cfg.providers.find((p) => p.id === id);
  if (!provider) return undefined;
  Object.assign(provider, patch);
  if (patch.baseUrl) provider.baseUrl = normalizeBaseUrl(patch.baseUrl);
  if (patch.apiPrefix !== undefined) provider.apiPrefix = patch.apiPrefix.trim() || "/v1";
  await persist();
  return provider;
}

export async function deleteProvider(id: string): Promise<void> {
  const cfg = await load();
  cfg.providers = cfg.providers.filter((p) => p.id !== id);
  if (cfg.settings.activeProviderId === id) {
    cfg.settings.activeProviderId = cfg.providers[0]?.id ?? null;
  }
  await persist();
}

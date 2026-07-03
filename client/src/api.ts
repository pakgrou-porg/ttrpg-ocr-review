import type {
  AppSettings,
  CuratedPageRecord,
  DocumentMeta,
  NativeTextResult,
  ProviderConfig,
  ProviderConfigInput,
  PublicProviderConfig,
  UnlimitedOcrResult,
} from "@ttrpg-ocr-review/shared";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    headers: isForm ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface RunOcrOptions {
  providerId?: string;
  prompt?: string;
  includeRegionsHint?: boolean;
  forceRerun?: boolean;
}

export const api = {
  listDocuments: () => request<DocumentMeta[]>("/api/documents"),

  uploadDocument: (pdf: File, jsonl: File | null) => {
    const form = new FormData();
    form.append("pdf", pdf);
    if (jsonl) form.append("jsonl", jsonl);
    return request<DocumentMeta>("/api/documents", { method: "POST", body: form });
  },

  getDocument: (id: string) => request<DocumentMeta>(`/api/documents/${id}`),

  pageImageUrl: (id: string, n: number) => `/api/documents/${id}/pages/${n}/image`,

  getNativeText: (id: string, n: number) =>
    request<NativeTextResult>(`/api/documents/${id}/pages/${n}/native-text`),

  getCuratedPage: (id: string, n: number) =>
    request<CuratedPageRecord | null>(`/api/documents/${id}/pages/${n}/curated`),

  runUnlimitedOcr: (id: string, n: number, opts: RunOcrOptions) =>
    request<UnlimitedOcrResult>(`/api/documents/${id}/pages/${n}/unlimited-ocr`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),

  listProviders: () => request<PublicProviderConfig[]>("/api/providers"),

  createProvider: (input: ProviderConfigInput) =>
    request<ProviderConfig>("/api/providers", { method: "POST", body: JSON.stringify(input) }),

  updateProvider: (id: string, patch: Partial<ProviderConfigInput>) =>
    request<ProviderConfig>(`/api/providers/${id}`, { method: "PUT", body: JSON.stringify(patch) }),

  deleteProvider: (id: string) => request<void>(`/api/providers/${id}`, { method: "DELETE" }),

  testProvider: (id: string) =>
    request<{ ok: boolean; models?: string[]; error?: string }>(`/api/providers/${id}/test`, {
      method: "POST",
    }),

  getSettings: () => request<AppSettings>("/api/settings"),

  updateSettings: (patch: Partial<AppSettings>) =>
    request<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
};

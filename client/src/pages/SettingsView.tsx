import { useEffect, useState } from "react";
import type { AppSettings, ProviderConfigInput, PublicProviderConfig } from "@ttrpg-ocr-review/shared";
import { api } from "../api";

const emptyForm: ProviderConfigInput = {
  name: "",
  baseUrl: "",
  apiPrefix: "/v1",
  apiKey: "",
  model: "",
  isOpenRouter: false,
  supportsVision: true,
};

export function SettingsView() {
  const [providers, setProviders] = useState<PublicProviderConfig[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [form, setForm] = useState<ProviderConfigInput>(emptyForm);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [p, s] = await Promise.all([api.listProviders(), api.getSettings()]);
    setProviders(p);
    setSettings(s);
  }

  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function addProvider() {
    if (!form.name || !form.baseUrl || !form.model) {
      setError("Name, base URL, and model are required.");
      return;
    }
    try {
      await api.createProvider(form);
      setForm(emptyForm);
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeProvider(id: string) {
    await api.deleteProvider(id);
    await refresh();
  }

  async function test(id: string) {
    setTestResults((r) => ({ ...r, [id]: "Testing…" }));
    const result = await api.testProvider(id);
    setTestResults((r) => ({
      ...r,
      [id]: result.ok ? `OK — ${result.models?.length ?? 0} models` : `Failed: ${result.error}`,
    }));
  }

  function toggleOpenRouter(checked: boolean) {
    setForm((f) => ({
      ...f,
      isOpenRouter: checked,
      baseUrl: checked && !f.baseUrl ? "https://openrouter.ai/api" : f.baseUrl,
      apiPrefix: f.apiPrefix || "/v1",
    }));
  }

  if (!settings) return <div className="p-8 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-10 p-8">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-300">Providers</h2>
        <ul className="divide-y divide-slate-800 rounded-lg border border-slate-700">
          {providers.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">
                  {p.name}{" "}
                  {p.id === settings.activeProviderId && <span className="text-indigo-400">(active)</span>}
                </div>
                <div className="text-slate-500">
                  {p.baseUrl}
                  {p.apiPrefix} · {p.model} · {p.isOpenRouter ? "OpenRouter" : "local"}
                </div>
                {testResults[p.id] && <div className="text-slate-400">{testResults[p.id]}</div>}
              </div>
              <div className="flex shrink-0 gap-2">
                {p.id !== settings.activeProviderId && (
                  <button
                    type="button"
                    onClick={async () => {
                      await api.updateSettings({ activeProviderId: p.id });
                      await refresh();
                    }}
                    className="rounded border border-slate-600 px-2 py-1 text-xs"
                  >
                    Set active
                  </button>
                )}
                <button type="button" onClick={() => test(p.id)} className="rounded border border-slate-600 px-2 py-1 text-xs">
                  Test
                </button>
                <button
                  type="button"
                  onClick={() => removeProvider(p.id)}
                  className="rounded border border-red-800 px-2 py-1 text-xs text-red-400"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {providers.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-500">No providers configured yet.</li>
          )}
        </ul>

        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-700 p-4">
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isOpenRouter} onChange={(e) => toggleOpenRouter(e.target.checked)} />
            OpenRouter (cloud)
          </label>
          <input
            className="col-span-2 rounded border border-slate-600 bg-transparent px-2 py-1 text-sm"
            placeholder="Name (e.g. LM Studio - Qwen2-VL)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="rounded border border-slate-600 bg-transparent px-2 py-1 text-sm"
            placeholder="Base URL (e.g. http://localhost:1234)"
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
          />
          <input
            className="rounded border border-slate-600 bg-transparent px-2 py-1 text-sm"
            placeholder="API prefix (default /v1)"
            value={form.apiPrefix}
            onChange={(e) => setForm((f) => ({ ...f, apiPrefix: e.target.value }))}
          />
          <input
            className="rounded border border-slate-600 bg-transparent px-2 py-1 text-sm"
            placeholder="Model id"
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
          />
          <input
            className="rounded border border-slate-600 bg-transparent px-2 py-1 text-sm"
            placeholder="API key (optional for local servers)"
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
          />
          <button
            type="button"
            onClick={addProvider}
            className="col-span-2 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
          >
            Add provider
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-300">Unlimited-OCR prompt</h2>
        <textarea
          className="h-32 w-full rounded border border-slate-600 bg-transparent p-2 text-sm"
          value={settings.ocrPrompt}
          onChange={(e) => setSettings({ ...settings, ocrPrompt: e.target.value })}
          onBlur={() => api.updateSettings({ ocrPrompt: settings.ocrPrompt })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.includeRegionsHintDefault}
            onChange={async (e) => {
              const next = { ...settings, includeRegionsHintDefault: e.target.checked };
              setSettings(next);
              await api.updateSettings({ includeRegionsHintDefault: e.target.checked });
            }}
          />
          Include curated regions as hints by default
        </label>
        <label className="flex items-center gap-2 text-sm">
          Render DPI
          <input
            type="number"
            min={72}
            max={300}
            className="w-20 rounded border border-slate-600 bg-transparent px-2 py-1"
            value={settings.renderDpi}
            onChange={async (e) => {
              const renderDpi = Number(e.target.value) || 150;
              setSettings({ ...settings, renderDpi });
              await api.updateSettings({ renderDpi });
            }}
          />
        </label>
      </section>
    </div>
  );
}

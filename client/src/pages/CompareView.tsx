import { useEffect, useMemo, useState } from "react";
import type {
  ComparisonResult,
  CuratedPageRecord,
  DocumentMeta,
  NativeTextResult,
  PublicProviderConfig,
  UnlimitedOcrResult,
} from "@ttrpg-ocr-review/shared";
import { api } from "../api";
import { BboxOverlay } from "../components/BboxOverlay";

export function CompareView({ docId, onBack }: { docId: string; onBack: () => void }) {
  const [meta, setMeta] = useState<DocumentMeta | null>(null);
  const [page, setPage] = useState(1);
  const [nativeText, setNativeText] = useState<NativeTextResult | null>(null);
  const [curated, setCurated] = useState<CuratedPageRecord | null>(null);
  const [ocrResult, setOcrResult] = useState<UnlimitedOcrResult | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [providers, setProviders] = useState<PublicProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [includeRegionsHint, setIncludeRegionsHint] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [compareBusy, setCompareBusy] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getDocument(docId).then(setMeta).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    Promise.all([api.listProviders(), api.getSettings()]).then(([p, s]) => {
      setProviders(p);
      setActiveProviderId(s.activeProviderId);
      setIncludeRegionsHint(s.includeRegionsHintDefault);
    });
  }, [docId]);

  useEffect(() => {
    setNativeText(null);
    setCurated(null);
    setOcrResult(null);
    setComparison(null);
    api.getNativeText(docId, page).then(setNativeText).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    api.getCuratedPage(docId, page).then(setCurated).catch(() => setCurated(null));
  }, [docId, page]);

  const imageUrl = api.pageImageUrl(docId, page);
  const regions = useMemo(() => curated?.labels?.regions ?? [], [curated]);

  async function runOcr(forceRerun = false) {
    if (!activeProviderId) {
      setError("Select a provider first (configure one in Settings if the list is empty).");
      return;
    }
    setOcrBusy(true);
    setError(null);
    try {
      const result = await api.runUnlimitedOcr(docId, page, {
        providerId: activeProviderId,
        includeRegionsHint,
        forceRerun,
      });
      setOcrResult(result);
      setComparison(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcrBusy(false);
    }
  }

  async function runCompare(forceRerun = false) {
    if (!activeProviderId || !ocrResult) return;
    setCompareBusy(true);
    setError(null);
    try {
      const result = await api.compareWithCurated(docId, page, {
        providerId: activeProviderId,
        unlimitedOcrText: ocrResult.text,
        forceRerun,
      });
      setComparison(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCompareBusy(false);
    }
  }

  if (!meta) return <div className="p-8 text-sm text-slate-400">Loading document…</div>;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="text-sm text-slate-400 hover:text-slate-200">
            ← Documents
          </button>
          <span className="text-sm font-medium">{meta.pdfFilename}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-slate-600 px-2 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            Page{" "}
            <input
              type="number"
              min={1}
              max={meta.pageCount}
              value={page}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 1 && n <= meta.pageCount) setPage(n);
              }}
              className="w-14 rounded border border-slate-600 bg-transparent px-1 text-center"
            />{" "}
            / {meta.pageCount}
          </span>
          <button
            type="button"
            disabled={page >= meta.pageCount}
            onClick={() => setPage((p) => Math.min(meta.pageCount, p + 1))}
            className="rounded border border-slate-600 px-2 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-red-900 bg-red-950/50 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
        <section className="flex flex-col rounded-lg border border-slate-800">
          <h2 className="border-b border-slate-800 px-3 py-2 text-sm font-medium">Extracted PDF (native text)</h2>
          <img src={imageUrl} alt={`Page ${page}`} className="max-h-80 w-full bg-slate-950 object-contain" />
          <div className="flex-1 overflow-auto p-3 text-xs">
            {nativeText ? (
              nativeText.hasEmbeddedText ? (
                <pre className="whitespace-pre-wrap font-sans">{nativeText.text}</pre>
              ) : (
                <p className="text-slate-500">No embedded text layer on this page (image-only).</p>
              )
            ) : (
              <p className="text-slate-500">Loading…</p>
            )}
          </div>
        </section>

        <section className="flex flex-col rounded-lg border border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <h2 className="text-sm font-medium">Curated pipeline (JSONL)</h2>
            {regions.length > 0 && (
              <label className="flex items-center gap-1 text-xs text-slate-400">
                <input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />
                Overlay
              </label>
            )}
          </div>
          <div className="relative max-h-80 w-full bg-slate-950">
            <img src={imageUrl} alt={`Page ${page}`} className="w-full object-contain" />
            {showOverlay && regions.length > 0 && <BboxOverlay regions={regions} />}
          </div>
          <div className="flex-1 overflow-auto p-3 text-xs">
            {curated ? (
              <>
                {curated.labels.page_layout?.layout_type && (
                  <p className="mb-2 text-slate-400">
                    Layout: {curated.labels.page_layout.layout_type}
                    {curated.labels.page_layout.columns ? ` · ${curated.labels.page_layout.columns} col` : ""}
                  </p>
                )}
                <pre className="whitespace-pre-wrap font-sans">
                  {curated.labels.ocr_text || "(no OCR text in export)"}
                </pre>
              </>
            ) : (
              <p className="text-slate-500">No curated record for this page.</p>
            )}
          </div>
        </section>

        <section className="flex flex-col rounded-lg border border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <h2 className="text-sm font-medium">Unlimited-OCR</h2>
            <label className="flex items-center gap-1 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={includeRegionsHint}
                onChange={(e) => setIncludeRegionsHint(e.target.checked)}
              />
              Hint w/ regions
            </label>
          </div>
          <img src={imageUrl} alt={`Page ${page}`} className="max-h-80 w-full bg-slate-950 object-contain" />
          <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
            <select
              value={activeProviderId ?? ""}
              onChange={(e) => setActiveProviderId(e.target.value || null)}
              className="flex-1 rounded border border-slate-600 bg-transparent px-2 py-1 text-xs"
            >
              <option value="">Select provider…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={ocrBusy}
              onClick={() => runOcr(Boolean(ocrResult))}
              className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {ocrBusy ? "Running…" : ocrResult ? "Run again" : "Run OCR"}
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3 text-xs">
            {ocrResult ? (
              <>
                <p className="mb-2 text-slate-400">
                  {ocrResult.model} · {ocrResult.latencyMs}ms {ocrResult.cached ? "· cached" : ""}
                </p>
                <pre className="whitespace-pre-wrap font-sans">{ocrResult.text}</pre>
              </>
            ) : (
              <p className="text-slate-500">Not run yet for this page.</p>
            )}
          </div>
        </section>
      </div>

      {ocrResult && (
        <div className="px-4 pb-4">
          <section className="flex flex-col rounded-lg border border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
              <h2 className="text-sm font-medium">Structural comparison (curated regions/OCR vs Unlimited-OCR)</h2>
              <button
                type="button"
                disabled={compareBusy || !curated}
                onClick={() => runCompare(Boolean(comparison))}
                title={curated ? undefined : "No curated JSONL data for this page"}
                className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {compareBusy ? "Comparing…" : comparison ? "Compare again" : "Compare vs curated"}
              </button>
            </div>
            <div className="p-3 text-xs">
              {comparison ? (
                <>
                  <p className="mb-2 text-slate-400">
                    {comparison.model} · {comparison.latencyMs}ms {comparison.cached ? "· cached" : ""}
                  </p>
                  <pre className="whitespace-pre-wrap font-sans">{comparison.text}</pre>
                </>
              ) : (
                <p className="text-slate-500">
                  {curated
                    ? "Checks whether Unlimited-OCR captured the text, images, and table alignment the curated pipeline identified."
                    : "No curated JSONL data for this page — load a JSONL export to enable this check."}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import type {
  ComparisonResult,
  CuratedPageRecord,
  DocumentMeta,
  LlmInteraction,
  NativeTextResult,
  PublicProviderConfig,
  UnlimitedOcrResult,
} from "@ttrpg-ocr-review/shared";
import { api } from "../api";
import { BboxOverlay } from "../components/BboxOverlay";
import { DiffText } from "../components/DiffText";
import { PageImage } from "../components/PageImage";
import { parseOcrRegions } from "../ocrRegions";

// Strips the model's native "type [x1, y1, x2, y2]content" bbox prefix from
// each line so the text is comparable against plain curated OCR output.
// Pure region markers with no text content (e.g. "image [0,46,999,134]") are
// dropped entirely. The raw response is always preserved in the LLM log.
function stripOcrBboxPrefixes(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^[a-z_]+ \[\d+,\s*\d+,\s*\d+,\s*\d+\]/, "").trimStart())
    .filter((line) => line.trim() !== "")
    .join("\n");
}

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
  const [showOcrOverlay, setShowOcrOverlay] = useState(true);
  const [showDiff, setShowDiff] = useState(true);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptOverride, setPromptOverride] = useState("");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [showRawOcr, setShowRawOcr] = useState(false);
  const [interactions, setInteractions] = useState<LlmInteraction[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [expandedInteraction, setExpandedInteraction] = useState<string | null>(null);

  function refreshInteractions() {
    api.getInteractions().then(setInteractions).catch(() => {});
  }

  useEffect(() => {
    api.getDocument(docId).then(setMeta).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    Promise.all([api.listProviders(), api.getSettings()]).then(([p, s]) => {
      setProviders(p);
      setActiveProviderId(s.activeProviderId);
      setIncludeRegionsHint(s.includeRegionsHintDefault);
      setPromptOverride(s.ocrPrompt || "");
      setDefaultPrompt(s.ocrPrompt || "");
    });
  }, [docId]);

  useEffect(() => {
    setNativeText(null);
    setCurated(null);
    setOcrResult(null);
    setComparison(null);
    setImageSize(null);
    api.getNativeText(docId, page).then(setNativeText).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    api.getCuratedPage(docId, page).then(setCurated).catch(() => setCurated(null));
  }, [docId, page]);

  const imageUrl = api.pageImageUrl(docId, page);
  const imageAspect = imageSize ? imageSize.width / imageSize.height : null;
  const regions = useMemo(() => curated?.labels?.regions ?? [], [curated]);
  const curatedText = curated?.labels?.ocr_text || null;
  const ocrRegions = useMemo(
    () => (ocrResult && imageSize ? parseOcrRegions(ocrResult.text, imageSize.width, imageSize.height) : null),
    [ocrResult, imageSize],
  );

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
        prompt: promptOverride || undefined,
      });
      setOcrResult(result);
      setComparison(null);
      refreshInteractions();
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
      refreshInteractions();
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
        <div className="flex items-center gap-4 text-sm">
          <button
            type="button"
            onClick={() => { setShowLog((v) => !v); if (!showLog) refreshInteractions(); }}
            className={`rounded border px-2 py-1 text-xs ${showLog ? "border-indigo-500 text-indigo-300" : "border-slate-600 text-slate-400 hover:text-slate-200"}`}
          >
            LLM Log{interactions.length > 0 ? ` (${interactions.length})` : ""}
          </button>
          {curatedText && (
            <label className="flex items-center gap-1 text-xs text-slate-400">
              <input type="checkbox" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} />
              Diff OCR vs curated
            </label>
          )}
          <div className="flex items-center gap-2">
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
        </div>
      </header>

      {error && (
        <div className="border-b border-red-900 bg-red-950/50 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
          <section className="flex flex-col rounded-lg border border-slate-800">
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-800 px-3">
              <h2 className="text-sm font-medium">Extracted PDF (native text)</h2>
            </div>
            <PageImage src={imageUrl} alt={`Page ${page}`} aspect={imageAspect} onLoadSize={setImageSize} />
            <div className="flex h-9 shrink-0 items-center border-b border-slate-800 px-3 text-xs text-slate-600">
              {nativeText && !nativeText.hasEmbeddedText && "No embedded text layer"}
            </div>
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
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-800 px-3">
              <h2 className="text-sm font-medium">Curated pipeline (JSONL)</h2>
            </div>
            <PageImage src={imageUrl} alt={`Page ${page}`} aspect={imageAspect} onLoadSize={setImageSize}>
              {showOverlay && regions.length > 0 && <BboxOverlay regions={regions} />}
            </PageImage>
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-800 px-3 text-xs text-slate-400">
              {regions.length > 0 ? (
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />
                  Overlay
                </label>
              ) : (
                <span className="text-slate-600">No regions</span>
              )}
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
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-800 px-3">
              <h2 className="text-sm font-medium">Unlimited-OCR</h2>
              <div className="flex items-center gap-3">
                {ocrRegions && ocrRegions.length > 0 && (
                  <label className="flex items-center gap-1 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={showOcrOverlay}
                      onChange={(e) => setShowOcrOverlay(e.target.checked)}
                    />
                    Overlay ({ocrRegions.length})
                  </label>
                )}
                {ocrResult && (
                  <label className="flex items-center gap-1 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={showRawOcr}
                      onChange={(e) => setShowRawOcr(e.target.checked)}
                    />
                    Raw
                  </label>
                )}
                <label className="flex items-center gap-1 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={includeRegionsHint}
                    onChange={(e) => setIncludeRegionsHint(e.target.checked)}
                  />
                  Hint w/ regions
                </label>
              </div>
            </div>
            <PageImage src={imageUrl} alt={`Page ${page}`} aspect={imageAspect} onLoadSize={setImageSize}>
              {showOcrOverlay && ocrRegions && ocrRegions.length > 0 && <BboxOverlay regions={ocrRegions} />}
            </PageImage>
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-slate-800 px-3">
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
            <div className="shrink-0 border-b border-slate-800">
              <button
                type="button"
                onClick={() => setShowPromptEditor((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-500 hover:text-slate-300"
              >
                <span>Prompt</span>
                {promptOverride !== defaultPrompt && (
                  <span className="rounded bg-amber-900/50 px-1 py-0.5 text-[10px] text-amber-400">modified</span>
                )}
                <span className="ml-auto">{showPromptEditor ? "▾" : "▸"}</span>
              </button>
              {showPromptEditor && (
                <div className="border-t border-slate-800/50 p-2">
                  <textarea
                    value={promptOverride}
                    onChange={(e) => setPromptOverride(e.target.value)}
                    rows={5}
                    className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                    placeholder="OCR prompt…"
                  />
                  {promptOverride !== defaultPrompt && (
                    <button
                      type="button"
                      onClick={() => setPromptOverride(defaultPrompt)}
                      className="mt-1 text-[10px] text-slate-500 hover:text-slate-300"
                    >
                      Reset to default
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto p-3 text-xs">
              {ocrResult ? (
                <>
                  <p className="mb-2 text-slate-400">
                    {ocrResult.model} · {ocrResult.latencyMs}ms {ocrResult.cached ? "· cached" : ""}
                  </p>
                  <pre className="whitespace-pre-wrap font-sans">
                    {showDiff && curatedText ? (
                      <DiffText
                        baseline={curatedText}
                        text={showRawOcr ? ocrResult.text : stripOcrBboxPrefixes(ocrResult.text)}
                      />
                    ) : showRawOcr ? (
                      ocrResult.text
                    ) : (
                      stripOcrBboxPrefixes(ocrResult.text)
                    )}
                  </pre>
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

        {showLog && (
          <div className="px-4 pb-4">
            <section className="flex flex-col rounded-lg border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                <h2 className="text-sm font-medium">LLM Interaction Log</h2>
                <button
                  type="button"
                  onClick={refreshInteractions}
                  className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
                >
                  Refresh
                </button>
              </div>
              {interactions.length === 0 ? (
                <div className="p-3 text-xs text-slate-500">
                  No interactions yet. Run OCR or a comparison to see requests here.
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {interactions.map((ix) => (
                    <div key={ix.id} className="text-xs">
                      <button
                        type="button"
                        onClick={() => setExpandedInteraction(expandedInteraction === ix.id ? null : ix.id)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-800/50"
                      >
                        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${ix.type === "ocr" ? "bg-indigo-900/60 text-indigo-300" : "bg-amber-900/60 text-amber-300"}`}>
                          {ix.type.toUpperCase()}
                        </span>
                        <span className="text-slate-300">p{ix.pageNumber}</span>
                        <span className="text-slate-500">{ix.model}</span>
                        <span className="text-slate-500">{ix.latencyMs}ms</span>
                        <span className="ml-auto text-slate-600">{new Date(ix.timestamp).toLocaleTimeString()}</span>
                        <span className="text-slate-600">{expandedInteraction === ix.id ? "▾" : "▸"}</span>
                      </button>
                      {expandedInteraction === ix.id && (
                        <div className="space-y-3 border-t border-slate-800/50 bg-slate-900/30 px-3 py-3">
                          <div>
                            <h4 className="mb-1 font-medium text-slate-400">Request messages</h4>
                            {ix.messages.map((m, mi) => (
                              <div key={mi} className="mb-2 rounded border border-slate-700/50 bg-slate-950/50 p-2">
                                <pre className="max-h-60 overflow-auto whitespace-pre-wrap font-sans text-slate-300">{m.content}</pre>
                              </div>
                            ))}
                          </div>
                          <div>
                            <h4 className="mb-1 font-medium text-slate-400">Response</h4>
                            <div className="rounded border border-slate-700/50 bg-slate-950/50 p-2">
                              <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-sans text-slate-300">{ix.responseText}</pre>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

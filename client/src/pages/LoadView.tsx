import { useEffect, useState } from "react";
import type { DocumentMeta } from "@ttrpg-ocr-review/shared";
import { api } from "../api";

export function LoadView({ onOpen }: { onOpen: (id: string) => void }) {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [jsonlFile, setJsonlFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jsonlWarning, setJsonlWarning] = useState<{ docId: string; message: string } | null>(null);

  function refreshDocuments() {
    return api.listDocuments().then(setDocuments);
  }

  useEffect(() => {
    refreshDocuments().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function handleUpload() {
    if (!pdfFile) return;
    setBusy(true);
    setError(null);
    setJsonlWarning(null);
    try {
      const meta = await api.uploadDocument(pdfFile, jsonlFile);
      await refreshDocuments();
      if (jsonlFile && meta.curatedPageCount === 0) {
        setJsonlWarning({
          docId: meta.id,
          message: `"${jsonlFile.name}" was accepted, but no page records could be parsed from it (expected one JSON object per line, or a JSON array of records, each with a "source.page_number" field). The document is loaded, but the curated pipeline panel will be empty until you load a file in a recognized shape.`,
        });
        return;
      }
      onOpen(meta.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold">OCR Comparison Console</h1>
        <p className="mt-1 text-sm text-slate-400">
          Load a source PDF and, optionally, a curated JSONL export to compare native PDF text,
          the curated pipeline output, and a fresh Unlimited-OCR pass side by side.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-700 p-4">
        <label className="block text-sm font-medium">
          Source PDF
          <input
            type="file"
            accept="application/pdf"
            className="mt-1 block w-full text-sm"
            onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="block text-sm font-medium">
          Curated JSONL export (optional)
          <input
            type="file"
            accept=".jsonl,.json,.txt"
            className="mt-1 block w-full text-sm"
            onChange={(e) => setJsonlFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {jsonlWarning && (
          <div className="space-y-2 rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-300">
            <p>{jsonlWarning.message}</p>
            <button
              type="button"
              onClick={() => onOpen(jsonlWarning.docId)}
              className="rounded border border-amber-700 px-2 py-1 text-xs hover:bg-amber-900/40"
            >
              Open anyway
            </button>
          </div>
        )}
        <button
          type="button"
          disabled={!pdfFile || busy}
          onClick={handleUpload}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Loading…" : "Load document"}
        </button>
      </div>

      {documents.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-slate-300">Previously loaded</h2>
          <ul className="divide-y divide-slate-800 rounded-lg border border-slate-700">
            {documents.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => onOpen(doc.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-800"
                >
                  <span>{doc.pdfFilename}</span>
                  <span className="text-slate-500">
                    {doc.pageCount} pages
                    {doc.jsonlFilename &&
                      (doc.curatedPageCount
                        ? ` · ${doc.curatedPageCount} curated`
                        : " · curated data unparsed")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

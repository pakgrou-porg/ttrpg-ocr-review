import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createCanvas, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import type { NativeTextResult } from "@ttrpg-ocr-review/shared";

const require = createRequire(import.meta.url);

// The legacy Node build expects to bootstrap its own worker; pointing
// GlobalWorkerOptions.workerSrc at the bundled worker file lets it run
// in-process via worker_threads without a bundler. The path must be a
// file:// URL, not a raw filesystem path — on Windows a bare "C:\..." path
// gets misparsed as a URL with scheme "c".
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

interface CanvasAndContext {
  canvas: Canvas;
  context: SKRSContext2D;
}

class NodeCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return { canvas, context };
  }

  reset(canvasAndContext: CanvasAndContext, width: number, height: number): void {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: Partial<CanvasAndContext>): void {
    canvasAndContext.canvas = undefined;
    canvasAndContext.context = undefined;
  }
}

// One parsed pdf.js document per docId, reused across page renders/text
// extraction so we don't re-parse the whole PDF on every request.
const documentCache = new Map<string, Promise<any>>();

function loadDocument(docId: string, pdfPath: string): Promise<any> {
  let doc = documentCache.get(docId);
  if (!doc) {
    doc = readFile(pdfPath).then((data) =>
      pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise,
    );
    documentCache.set(docId, doc);
  }
  return doc;
}

export async function getPageCount(docId: string, pdfPath: string): Promise<number> {
  const doc = await loadDocument(docId, pdfPath);
  return doc.numPages as number;
}

export async function renderPagePng(
  docId: string,
  pdfPath: string,
  pageNumber: number,
  dpi: number,
): Promise<Buffer> {
  const doc = await loadDocument(docId, pdfPath);
  const page = await doc.getPage(pageNumber);
  const scale = dpi / 72;
  const viewport = page.getViewport({ scale });
  const canvasFactory = new NodeCanvasFactory();
  const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
  await page.render({
    canvasContext: canvasAndContext.context,
    viewport,
    canvasFactory,
  }).promise;
  const buffer = canvasAndContext.canvas.toBuffer("image/png");
  page.cleanup();
  return buffer;
}

export async function extractNativeText(
  docId: string,
  pdfPath: string,
  pageNumber: number,
): Promise<NativeTextResult> {
  const doc = await loadDocument(docId, pdfPath);
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  let text = "";
  for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
    if (typeof item.str !== "string") continue;
    text += item.str;
    text += item.hasEOL ? "\n" : " ";
  }
  text = text.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
  page.cleanup();
  return { pageNumber, hasEmbeddedText: text.length > 0, text };
}

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { parseJsonlContent, parseJsonlFile } from "./jsonl.js";

describe("parseJsonlContent", () => {
  it("parses valid lines keyed by page number", () => {
    const content = [
      JSON.stringify({ source: { page_number: 1 }, labels: { ocr_text: "one" } }),
      JSON.stringify({ source: { page_number: 2 }, labels: { ocr_text: "two" } }),
    ].join("\n");

    const parsed = parseJsonlContent(content);
    expect(parsed.size).toBe(2);
    expect(parsed.get(1)?.labels.ocr_text).toBe("one");
    expect(parsed.get(2)?.labels.ocr_text).toBe("two");
  });

  it("skips blank lines and malformed JSON without throwing", () => {
    const content = [
      "",
      "   ",
      "{not valid json",
      JSON.stringify({ source: { page_number: 3 }, labels: {} }),
    ].join("\n");

    const parsed = parseJsonlContent(content);
    expect(parsed.size).toBe(1);
    expect(parsed.has(3)).toBe(true);
  });

  it("skips records missing a numeric page number", () => {
    const content = [
      JSON.stringify({ source: {}, labels: {} }),
      JSON.stringify({ source: { page_number: "4" }, labels: {} }),
    ].join("\n");

    const parsed = parseJsonlContent(content);
    expect(parsed.size).toBe(0);
  });

  it("keeps the last record when a page number repeats", () => {
    const content = [
      JSON.stringify({ source: { page_number: 1 }, labels: { ocr_text: "first" } }),
      JSON.stringify({ source: { page_number: 1 }, labels: { ocr_text: "second" } }),
    ].join("\n");

    const parsed = parseJsonlContent(content);
    expect(parsed.get(1)?.labels.ocr_text).toBe("second");
  });

  it("falls back to a pretty-printed JSON array when no line parses on its own", () => {
    const content = JSON.stringify(
      [
        { source: { page_number: 1 }, labels: { ocr_text: "one" } },
        { source: { page_number: 2 }, labels: { ocr_text: "two" } },
      ],
      null,
      2,
    );

    const parsed = parseJsonlContent(content);
    expect(parsed.size).toBe(2);
    expect(parsed.get(2)?.labels.ocr_text).toBe("two");
  });

  it("falls back to a wrapper object holding an array of records", () => {
    const content = JSON.stringify(
      {
        document: "Sample Rulebook",
        pages: [
          { source: { page_number: 1 }, labels: { ocr_text: "one" } },
          { source: { page_number: 2 }, labels: { ocr_text: "two" } },
        ],
      },
      null,
      2,
    );

    const parsed = parseJsonlContent(content);
    expect(parsed.size).toBe(2);
    expect(parsed.get(1)?.labels.ocr_text).toBe("one");
  });

  it("falls back to an object keyed by page id whose values are records", () => {
    const content = JSON.stringify(
      {
        "1": { source: { page_number: 1 }, labels: { ocr_text: "one" } },
        "2": { source: { page_number: 2 }, labels: { ocr_text: "two" } },
      },
      null,
      2,
    );

    const parsed = parseJsonlContent(content);
    expect(parsed.size).toBe(2);
  });

  it("returns an empty map for JSON that matches no known shape", () => {
    const content = JSON.stringify({ document: "Sample Rulebook", note: "no page data here" });
    expect(parseJsonlContent(content).size).toBe(0);
  });

  it("recognizes ttrpg-ocr-console's full document-bundle export shape", () => {
    // pages[] entries keyed by `pageNumber`, regions under
    // pageJsonOutput.content_regions, OCR text nested under ocr.*.
    const content = JSON.stringify({
      document: { title: "Sample Rulebook" },
      content_structure: [{ _id: 1, level_type: "section", heading_text: "Intro" }],
      pages: [
        {
          pageNumber: 1,
          imageWidth: 612,
          imageHeight: 792,
          contentRegions: [{ bbox: { x: 10, y: 10, w: 80, h: 8 }, type: "heading", sequence: 1 }],
          pageJsonOutput: {
            layout: { columns: 1, layout_type: "body_text" },
            content_regions: [
              { bbox: { x: 10, y: 10, w: 80, h: 8 }, regionType: "heading", sequence: 1 },
              { bbox: { x: 10, y: 20, w: 80, h: 30 }, regionType: "illustration", sequence: 2 },
            ],
          },
          ocr: {
            rawText: "raw",
            normalisedText: "normalised",
            markdownText: "# Chapter One",
          },
        },
      ],
    });

    const parsed = parseJsonlContent(content);
    expect(parsed.size).toBe(1);
    const record = parsed.get(1);
    expect(record?.labels.ocr_text).toBe("# Chapter One");
    expect(record?.labels.page_layout?.layout_type).toBe("body_text");
    // Prefers the refined pageJsonOutput.content_regions over the coarser
    // top-level contentRegions.
    expect(record?.labels.regions).toHaveLength(2);
    expect(record?.labels.regions?.[1].regionType).toBe("illustration");
  });

  it("falls back to rawText when markdownText/normalisedText are absent", () => {
    const content = JSON.stringify({ pages: [{ pageNumber: 1, ocr: { rawText: "only raw" } }] });
    const parsed = parseJsonlContent(content);
    expect(parsed.get(1)?.labels.ocr_text).toBe("only raw");
  });
});

describe("parseJsonlFile", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function writeTempFile(name: string, content: string): string {
    dir = mkdtempSync(join(tmpdir(), "jsonl-test-"));
    const filePath = join(dir, name);
    writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  it("streams true JSONL without buffering it as one document", async () => {
    const content = [
      JSON.stringify({ source: { page_number: 1 }, labels: { ocr_text: "one" } }),
      JSON.stringify({ source: { page_number: 2 }, labels: { ocr_text: "two" } }),
    ].join("\n");
    const filePath = writeTempFile("sample.jsonl", content);

    const parsed = await parseJsonlFile(filePath);
    expect(parsed.size).toBe(2);
    expect(parsed.get(2)?.labels.ocr_text).toBe("two");
  });

  it("streams a pretty-printed top-level JSON array without a whole-file string read", async () => {
    const content = JSON.stringify(
      [
        { source: { page_number: 1 }, labels: { ocr_text: "one" } },
        { source: { page_number: 2 }, labels: { ocr_text: "two" } },
      ],
      null,
      2,
    );
    const filePath = writeTempFile("sample.json", content);

    const parsed = await parseJsonlFile(filePath);
    expect(parsed.size).toBe(2);
  });

  it("streams a bundle-shaped wrapper object (document metadata + pages[])", async () => {
    const content = JSON.stringify(
      {
        document: { title: "Sample Rulebook" },
        content_structure: [{ _id: 1, level_type: "section" }],
        pages: [
          { pageNumber: 1, ocr: { rawText: "one" } },
          { pageNumber: 2, ocr: { rawText: "two" } },
        ],
      },
      null,
      2,
    );
    const filePath = writeTempFile("bundle.json", content);

    const parsed = await parseJsonlFile(filePath);
    expect(parsed.size).toBe(2);
    expect(parsed.get(1)?.labels.ocr_text).toBe("one");
  });
});

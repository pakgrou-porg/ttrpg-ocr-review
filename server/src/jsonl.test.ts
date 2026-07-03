import { describe, expect, it } from "vitest";
import { parseJsonlContent } from "./jsonl.js";

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
});

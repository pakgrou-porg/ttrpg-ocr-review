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
});

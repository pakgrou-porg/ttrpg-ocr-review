import { describe, expect, it } from "vitest";
import type { CuratedPageRecord } from "@ttrpg-ocr-review/shared";
import { buildCuratedComparisonContext, buildRegionsHintText, promptHash } from "./ocr.js";

const curated: CuratedPageRecord = {
  source: { page_number: 1 },
  labels: {
    regions: [
      { sequence: 2, regionType: "paragraph", bbox: { x: 0, y: 40, w: 100, h: 30 } },
      { sequence: 1, regionType: "heading", bbox: { x: 0, y: 0, w: 100, h: 10 } },
    ],
  },
};

const curatedWithTableAndImage: CuratedPageRecord = {
  source: { page_number: 1 },
  labels: {
    page_layout: { layout_type: "body_text", columns: 2 },
    regions: [
      { sequence: 1, regionType: "heading", bbox: { x: 0, y: 0, w: 100, h: 10 } },
      { sequence: 2, regionType: "stat_block", bbox: { x: 0, y: 10, w: 100, h: 20 } },
      { sequence: 3, regionType: "art", bbox: { x: 0, y: 30, w: 50, h: 20 } },
    ],
    ocr_text: "Ancient Red Dragon\nAC 22 HP 546",
  },
};

describe("promptHash", () => {
  it("is deterministic for identical inputs", () => {
    expect(promptHash("prompt", true, "hint")).toBe(promptHash("prompt", true, "hint"));
  });

  it("differs when the prompt changes", () => {
    expect(promptHash("prompt a", true, "hint")).not.toBe(promptHash("prompt b", true, "hint"));
  });

  it("differs when includeRegionsHint changes", () => {
    expect(promptHash("prompt", true, "hint")).not.toBe(promptHash("prompt", false, "hint"));
  });
});

describe("buildRegionsHintText", () => {
  it("returns an empty string when there are no regions", () => {
    expect(buildRegionsHintText(null)).toBe("");
    expect(buildRegionsHintText({ source: { page_number: 1 }, labels: {} })).toBe("");
  });

  it("orders regions by sequence regardless of input order", () => {
    const text = buildRegionsHintText(curated);
    const headingIndex = text.indexOf("heading");
    const paragraphIndex = text.indexOf("paragraph");
    expect(headingIndex).toBeGreaterThan(-1);
    expect(paragraphIndex).toBeGreaterThan(-1);
    expect(headingIndex).toBeLessThan(paragraphIndex);
  });
});

describe("buildCuratedComparisonContext", () => {
  it("reports no curated record when none exists", () => {
    expect(buildCuratedComparisonContext(null)).toBe("No curated record exists for this page.");
  });

  it("counts image and table regions distinctly from plain text regions", () => {
    const text = buildCuratedComparisonContext(curatedWithTableAndImage);
    expect(text).toContain("3 total, 1 image/figure, 1 table/stat-block");
  });

  it("includes the curated OCR text and layout metadata", () => {
    const text = buildCuratedComparisonContext(curatedWithTableAndImage);
    expect(text).toContain("body_text, 2 column(s)");
    expect(text).toContain("Ancient Red Dragon");
  });

  it("treats a page with no regions as zero counts, not a crash", () => {
    const text = buildCuratedComparisonContext({ source: { page_number: 1 }, labels: {} });
    expect(text).toContain("0 total, 0 image/figure, 0 table/stat-block");
  });
});

import { describe, expect, it } from "vitest";
import type { CuratedPageRecord } from "@ttrpg-ocr-review/shared";
import { buildRegionsHintText, promptHash } from "./ocr.js";

const curated: CuratedPageRecord = {
  source: { page_number: 1 },
  labels: {
    regions: [
      { sequence: 2, regionType: "paragraph", bbox: { x: 0, y: 40, w: 100, h: 30 } },
      { sequence: 1, regionType: "heading", bbox: { x: 0, y: 0, w: 100, h: 10 } },
    ],
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

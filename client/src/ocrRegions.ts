import type { CuratedRegion } from "@ttrpg-ocr-review/shared";

const TAG_PATTERN = /^([A-Za-z_][\w-]*)\s*\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/gm;

// Best-effort: some vision models (observed: baidu/Unlimited-OCR) emit their
// own inline layout tags — `header [x1, y1, x2, y2]text...` — instead of
// plain prose, with pixel coordinates relative to the image actually sent
// to the model. When the response looks like that, extract it as regions
// so it can be overlaid the same way curated regions are. Returns null if
// no tags are found (the common case — plain-text OCR output).
export function parseOcrRegions(
  text: string,
  imageWidth: number,
  imageHeight: number,
): CuratedRegion[] | null {
  const matches = [...text.matchAll(TAG_PATTERN)];
  if (matches.length === 0 || !imageWidth || !imageHeight) return null;

  return matches.map((m, i) => {
    const [, type, x1, y1, x2, y2] = m;
    const x1n = Number(x1);
    const y1n = Number(y1);
    const x2n = Number(x2);
    const y2n = Number(y2);
    return {
      sequence: i + 1,
      type,
      regionType: type,
      bbox: {
        x: (x1n / imageWidth) * 100,
        y: (y1n / imageHeight) * 100,
        w: ((x2n - x1n) / imageWidth) * 100,
        h: ((y2n - y1n) / imageHeight) * 100,
      },
    };
  });
}

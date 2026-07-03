import { createWriteStream } from "node:fs";

// Builds a large bundle_v1-shaped fixture (document + content_structure +
// pages[]) to stress-test streaming JSONL parsing at real scale, without
// needing the user's actual multi-hundred-MB export.
const PAGE_COUNT = 400;
const out = createWriteStream(new URL("./large-bundle.json", import.meta.url));

function page(n) {
  // ~800KB padding x2 fields x 400 pages ~= 640MB total, comfortably past
  // V8's ~536M character string-length ceiling — the actual bug we hit.
  const padding = "x".repeat(800_000);
  return {
    pageNumber: n,
    partIndex: 0,
    imageWidth: 612,
    imageHeight: 792,
    layoutType: null,
    contentRegions: [
      { bbox: { x: 10, y: 5, w: 80, h: 8 }, type: "heading", sequence: 1, regionType: "heading" },
      { bbox: { x: 10, y: 15, w: 80, h: 60 }, type: "paragraph", sequence: 2, regionType: "paragraph" },
    ],
    pageJsonOutput: {
      layout: { columns: 1, layout_type: "body_text" },
      content_regions: [
        { bbox: { x: 10, y: 5, w: 80, h: 8 }, regionType: "heading", sequence: 1 },
        { bbox: { x: 10, y: 15, w: 80, h: 60 }, regionType: "paragraph", sequence: 2 },
        { bbox: { x: 10, y: 78, w: 40, h: 15 }, regionType: "graphic", sequence: 3 },
      ],
      padding,
    },
    ocr: {
      rawText: `Page ${n} heading\nSome body text for page ${n}.`,
      normalisedText: `Page ${n} heading\nSome body text for page ${n}.`,
      markdownText: `## Page ${n} heading\n\nSome body text for page ${n}.`,
      padding,
    },
  };
}

out.write('{\n  "schema_version": "bundle_v1",\n  "document": {"title": "Synthetic Large Bundle"},\n');
out.write('  "content_structure": [');
for (let i = 0; i < 50; i++) {
  out.write((i > 0 ? "," : "") + JSON.stringify({ _id: i, level_type: "section", heading_text: `Section ${i}` }));
}
out.write('],\n  "pages": [\n');
for (let n = 1; n <= PAGE_COUNT; n++) {
  out.write((n > 1 ? ",\n" : "") + JSON.stringify(page(n)));
}
out.write("\n  ]\n}\n");
out.end();

out.on("finish", () => console.log("wrote fixtures/large-bundle.json"));

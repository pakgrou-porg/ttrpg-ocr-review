import type { CuratedRegion } from "@ttrpg-ocr-review/shared";

const TYPE_COLORS: Record<string, string> = {
  heading: "#a855f7",
  paragraph: "#3b82f6",
  header: "#f97316",
  footer: "#f97316",
  table: "#10b981",
  image: "#ec4899",
  sidebar: "#eab308",
  stat_block: "#ef4444",
};

function colorFor(region: CuratedRegion): string {
  const key = region.regionType ?? region.type ?? "";
  return TYPE_COLORS[key] ?? "#94a3b8";
}

// SVG stretched over the page image via viewBox 0-100 + preserveAspectRatio
// "none", so every region bbox (already normalized to 0-100 percent space)
// lines up regardless of the image's actual pixel dimensions.
export function BboxOverlay({ regions }: { regions: CuratedRegion[] }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
      {regions.map((region) => {
        const color = colorFor(region);
        const { x, y, w, h } = region.bbox;
        return (
          <g key={region.sequence}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={color}
              fillOpacity={0.15}
              stroke={color}
              strokeWidth={0.3}
              vectorEffect="non-scaling-stroke"
            />
            <text x={x + 0.5} y={Math.max(2.5, y + 2.5)} fontSize={2.2} fill={color}>
              {region.regionType ?? region.type ?? "region"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

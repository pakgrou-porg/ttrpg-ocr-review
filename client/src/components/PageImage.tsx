import type { ReactNode } from "react";

interface PageImageProps {
  src: string;
  alt: string;
  aspect: number | null;
  onLoadSize?: (size: { width: number; height: number }) => void;
  children?: ReactNode;
}

// A fixed-height slot (so all three compare columns line up) containing an
// inner box sized to the image's true aspect ratio, so `object-contain`
// never has to letterbox it — the image fills the inner box edge to edge.
// That matters because an absolutely-positioned bbox-overlay SVG sized to
// `inset-0 h-full w-full` only lines up with the image when the image
// itself fills its container exactly; if the outer box's aspect ratio
// didn't match the image's (e.g. a plain fixed h-80 w-full box holding a
// portrait page), object-contain would letterbox the image inside it while
// the overlay kept filling the full box, throwing every region off.
export function PageImage({ src, alt, aspect, onLoadSize, children }: PageImageProps) {
  return (
    <div className="relative flex h-80 w-full shrink-0 items-center justify-center overflow-hidden bg-slate-950">
      <div
        className="relative h-full"
        style={aspect ? { aspectRatio: String(aspect), maxWidth: "100%" } : { width: "100%" }}
      >
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-contain"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              onLoadSize?.({ width: img.naturalWidth, height: img.naturalHeight });
            }
          }}
        />
        {children}
      </div>
    </div>
  );
}

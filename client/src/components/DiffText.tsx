import { diffWords } from "diff";

// Word-level diff against a baseline (the curated pipeline's OCR text, since
// that's the tool's reference for judging the other two sources). Matched
// words render plain; words missing from this text but present in the
// baseline render struck through; words present here but not in the
// baseline render underlined.
export function DiffText({ baseline, text }: { baseline: string; text: string }) {
  const parts = diffWords(baseline, text);
  return (
    <>
      {parts.map((part, i) => {
        if (part.added) {
          return (
            <span key={i} className="bg-emerald-900/50 text-emerald-300 underline decoration-emerald-500">
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span key={i} className="bg-red-900/40 text-red-300/80 line-through decoration-red-500">
              {part.value}
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </>
  );
}

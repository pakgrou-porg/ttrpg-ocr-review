import { diffWords } from "diff";

function normalizeForDiff(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function DiffText({ baseline, text }: { baseline: string; text: string }) {
  const parts = diffWords(normalizeForDiff(baseline), normalizeForDiff(text));
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

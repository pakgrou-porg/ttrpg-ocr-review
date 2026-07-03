import { writeFileSync, statSync } from "node:fs";

function escapePdfText(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function makePdf(pages) {
  const objs = [];
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, i) => 3 + i * 2 + " 0 R").join(" ");
  objs.push("<< /Type /Pages /Kids [" + kids + "] /Count " + pages.length + " >>");
  pages.forEach((text, i) => {
    const pageObjNum = 3 + i * 2;
    const contentObjNum = 4 + i * 2;
    objs[pageObjNum - 1] =
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 " +
      (3 + pages.length * 2) +
      " 0 R >> >> /Contents " +
      contentObjNum +
      " 0 R >>";
    const stream = "BT /F1 24 Tf 72 700 Td (" + escapePdfText(text) + ") Tj ET";
    objs[contentObjNum - 1] = "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream";
  });
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let out = "%PDF-1.4\n";
  const offsets = [0];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += i + 1 + " 0 obj\n" + body + "\nendobj\n";
  });
  const xrefStart = out.length;
  out += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
  for (let i = 1; i <= objs.length; i++) {
    out += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  out += "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefStart + "\n%%EOF";
  return out;
}

const pdf = makePdf(["Chapter One: The Dragon Awakens", "Chapter Two: Into the Dungeon"]);
writeFileSync(new URL("./sample.pdf", import.meta.url), pdf, "latin1");
console.log("wrote", statSync(new URL("./sample.pdf", import.meta.url)).size, "bytes");

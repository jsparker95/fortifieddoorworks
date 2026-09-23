import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { makeDocument } from "../lib/documents";
import { PDFDocument } from "pdf-lib";
import { Project } from "../lib/types";
async function main() {
  const { projects } = JSON.parse(
    readFileSync("local-data/seed.json", "utf8"),
  ) as { projects: Project[] };
  const p = projects.find((p) => p.name.startsWith("Door Type"))!;
  mkdirSync("local-data/pdf-checks", { recursive: true });
  for (const type of [
    "Submittal",
    "Takeoff",
    "Opening schedule",
    "Build sheet",
    "labels",
  ]) {
    const bytes = await makeDocument(p, type, {
      labelKind: "Hardware",
      labelWidth: 4,
      labelHeight: 2,
    });
    writeFileSync(`local-data/pdf-checks/${type}.pdf`, bytes);
    const doc = await PDFDocument.load(bytes);
    console.log(type, doc.getPageCount(), "pages", doc.getPage(0).getSize());
  }
}
main();

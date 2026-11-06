"""Read an exported legacy takeoff workbook without modifying it.

Comparison data is separate from PDF-only extraction inputs. Never feed this
output to the model whose extraction accuracy is being measured.
"""
import argparse
import hashlib
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def read_workbook(path):
    sheets = {}
    with zipfile.ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = ["".join(t.text or "" for t in item.iter(NS + "t"))
                      for item in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        relationships = {r.attrib["Id"]: r.attrib["Target"]
                         for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).find(NS + "sheets"):
            target = relationships[sheet.attrib[REL]]
            target = target.lstrip("/") if target.startswith("/") else "xl/" + target
            doc = ET.fromstring(archive.read(target))
            rows = []
            for row in doc.findall(NS + "sheetData/" + NS + "row"):
                cells = {}
                for cell in row:
                    value = cell.find(NS + "v")
                    text = value.text if value is not None else "".join(t.text or "" for t in cell.iter(NS + "t"))
                    if cell.attrib.get("t") == "s" and text:
                        text = shared[int(text)]
                    if text not in (None, ""):
                        cells[re.sub(r"\d+$", "", cell.attrib["r"])] = text
                if cells:
                    rows.append({"row": int(row.attrib["r"]), "cells": cells})
            sheets[sheet.attrib["name"]] = {"dimension": doc.find(NS + "dimension").attrib.get("ref") if doc.find(NS + "dimension") is not None else None, "rows": rows}
    return sheets


def meaningful_rows(sheets, name):
    return [row for row in sheets.get(name, {}).get("rows", [])
            if row["row"] > 1 and row["cells"].get("A", "").strip()
            and row["cells"]["A"].strip() not in ("0", "Name", "Part Name")]


def number(value):
    try:
        result = float(value)
        return int(result) if result.is_integer() else result
    except (ValueError, TypeError):
        return None


def summarize(sheets):
    takeoff = sheets.get("Takeoff", {}).get("rows", [])
    first = next((row["cells"] for row in takeoff if row["row"] == 1), {})
    frames = [r for r in meaningful_rows(sheets, "Frames") if r["cells"].get("P", "0") not in ("1", "TRUE", "true")]
    doors = meaningful_rows(sheets, "Doors")
    hardware = [r for r in takeoff if r["row"] >= 3 and r["cells"].get("K", "").strip() and number(r["cells"].get("L")) not in (None, 0)]
    return {"frameAssemblies": number(first.get("C")), "doorAssemblies": number(first.get("G")),
            "hardwareUnits": number(first.get("L")), "frameRecords": len(frames), "doorRecords": len(doors),
            "hardwarePartLines": len(hardware), "handingCodes": sorted(set(r["cells"].get("G", "") for r in frames)),
            "aggregateEvidence": ["Takeoff!C1", "Takeoff!G1", "Takeoff!L1"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    sheets = read_workbook(args.workbook)
    result = {"workbookPath": str(args.workbook.resolve()), "workbookSha256": hashlib.sha256(args.workbook.read_bytes()).hexdigest(),
              "summary": summarize(sheets), "sheets": sheets,
              "limitations": ["Uses the exported workbook's cached formula results; original Google Sheets is not edited or recalculated.",
                              "Human scope decisions and product substitutions require evidence review; totals alone do not establish field accuracy."]}
    args.output.write_text(json.dumps(result, indent=2))
    print(json.dumps(result["summary"]))

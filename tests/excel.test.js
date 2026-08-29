import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { TARGET_FIELDS } from "../src/config.js";
import { analyzeWorkbook, planFromSheetNames, writeWorkbook } from "../src/excel.js";
import { DECISIONS, createReviewSession, setDecision } from "../src/review.js";

test("季度工作表规划优先级正确", () => {
  assert.equal(planFromSheetNames(["2026Q1", "模板"], "2026Q2").sourceSheet, "模板");
  assert.equal(planFromSheetNames(["2025Q4", "2026Q1"], "2026Q2").sourceSheet, "2026Q1");
  assert.equal(planFromSheetNames(["2026Q2"], "2026Q2").requiresCreation, false);
});

const samplePath = process.env.AMAZON_SAMPLE_EXCEL;
test("真实模板可直接分析并生成保留公式和截图的工作簿", { skip: !samplePath }, async () => {
  const bytes = await fs.readFile(samplePath);
  const source = { name: samplePath.split(/[\\/]/).pop(), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  const plan = await analyzeWorkbook(source, "2026Q2");
  assert.equal(plan.targetQuarter, "2026Q2");
  const values = [89147.4, 15050.27, 1082.56, 3.71, 10909.94, 33616.94];
  const result = {
    key: "2026Q2-HY-US",
    metadata: { quarter: "2026Q2", store: "HY", country: "US", countryName: "美国", currency: "USD" },
    expensesSubtotalDebits: -44526.88,
    incomeValidation: { status: "PASS" }, expensesValidation: { status: "PASS" }, health: "GOOD",
    fields: Object.fromEntries(TARGET_FIELDS.map((name, index) => [name, { name, status: "FOUND", value: values[index] }])),
  };
  const session = createReviewSession([result]);
  for (const name of TARGET_FIELDS) setDecision(session, result.key, name, DECISIONS.APPROVED);
  const image = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  const output = await writeWorkbook(source, session, new Map([[result.key, { bytes: image, width: 1, height: 1 }]]));
  assert.ok(output.blob.size > 0);
  const zip = await JSZip.loadAsync(await output.blob.arrayBuffer());
  const workbook = new DOMParser().parseFromString(await zip.file("xl/workbook.xml").async("string"));
  const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const relNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const pkgNs = "http://schemas.openxmlformats.org/package/2006/relationships";
  const sheetNode = Array.from(workbook.getElementsByTagNameNS(main, "sheet")).find((node) => node.getAttribute("name") === "2026Q2");
  const rels = new DOMParser().parseFromString(await zip.file("xl/_rels/workbook.xml.rels").async("string"));
  const rid = sheetNode.getAttributeNS(relNs, "id") || sheetNode.getAttribute("r:id");
  const relation = Array.from(rels.getElementsByTagNameNS(pkgNs, "Relationship")).find((node) => node.getAttribute("Id") === rid);
  const sheetPath = `xl/${relation.getAttribute("Target").replaceAll("\\", "/")}`;
  const sheet = new DOMParser().parseFromString(await zip.file(sheetPath).async("string"));
  const cells = Array.from(sheet.getElementsByTagNameNS(main, "c"));
  const commission = cells.find((cell) => cell.getAttribute("r") === "J3");
  assert.match(commission.getElementsByTagNameNS(main, "f")[0].textContent, /^ROUND\(ABS\(-44526\.88\)-I3,2\)$/);
  assert.ok(sheet.getElementsByTagNameNS(main, "drawing").length >= 1);
  assert.ok(Object.keys(zip.files).some((name) => /^xl\/media\/amazon_report_\d+\.png$/.test(name)));
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { COUNTRIES, TARGET_FIELDS } from "../src/config.js";
import { analyzeWorkbook, createSummaryWorkbook, findCountryRow, planFromSheetNames, writeWorkbook } from "../src/excel.js";
import { DECISIONS, createReviewSession, setDecision } from "../src/review.js";

test("季度工作表规划优先级正确", () => {
  assert.equal(planFromSheetNames(["2026Q1", "模板"], "2026Q2").sourceSheet, "模板");
  assert.equal(planFromSheetNames(["2025Q4", "2026Q1"], "2026Q2").sourceSheet, "2026Q1");
  assert.equal(planFromSheetNames(["2026Q2"], "2026Q2").requiresCreation, false);
});

test("国家匹配与工作表行顺序无关", () => {
  const rows = [
    { row: 18, marketplace: "amazon.co.jp", countryName: "日本", currency: "JPY" },
    { row: 2, marketplace: "amazon.com.br", countryName: "巴西", currency: "BRL" },
    { row: 6, marketplace: "amazon.com.br", countryName: "巴西\n（联合报告）", currency: "BRL" },
    { row: 44, marketplace: "amazon.com", countryName: "美国", currency: "USD" },
    { row: 7, marketplace: "amazon.ca", countryName: "加拿大", currency: "CAD" },
  ];
  assert.equal(findCountryRow(rows, "US"), 44);
  assert.equal(findCountryRow(rows, "CA"), 7);
  assert.equal(findCountryRow(rows, "JP"), 18);
  assert.throws(() => findCountryRow(rows, "BR"), /多个同分候选行/);
  assert.equal(findCountryRow([rows[2]], "BR"), 6);
  assert.equal(findCountryRow([{ row: 16, marketplace: "", countryName: "比利时", currency: "无" }], "BE"), 16);
  assert.equal(findCountryRow([{ row: 13, marketplace: "amazon.SE", countryName: "瑞典", currency: "kr" }], "KR"), 13);
});

function makeResult(code, quarter = "2026Q2", values = [100, 20, 3, 1, 8, 42], subtotal = -50) {
  const country = COUNTRIES[code];
  return {
    key: `${quarter}-HY-${code}`,
    metadata: { quarter, store: "HY", country: code, countryName: country.displayName, currency: country.currency, sourceName: `${quarter}-HY-${code}.pdf` },
    expensesSubtotalDebits: subtotal,
    incomeValidation: { status: "PASS" }, expensesValidation: { status: "PASS" }, health: "GOOD",
    fields: Object.fromEntries(TARGET_FIELDS.map((name, index) => [name, { name, status: "FOUND", value: values[index] }])),
  };
}

function approvedSession(results) {
  const session = createReviewSession(results);
  for (const result of results) for (const name of TARGET_FIELDS) setDecision(session, result.key, name, DECISIONS.APPROVED);
  return session;
}

function fileFromBytes(name, bytes) {
  return { name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

const tinyPng = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));

const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const pkgNs = "http://schemas.openxmlformats.org/package/2006/relationships";
const domParser = new DOMParser();

async function sheetPackage(zip, sheetName) {
  const workbook = domParser.parseFromString(await zip.file("xl/workbook.xml").async("string"));
  const sheetNode = Array.from(workbook.getElementsByTagNameNS(main, "sheet")).find((node) => node.getAttribute("name") === sheetName);
  assert.ok(sheetNode, `缺少工作表 ${sheetName}`);
  const rels = domParser.parseFromString(await zip.file("xl/_rels/workbook.xml.rels").async("string"));
  const rid = sheetNode.getAttributeNS(relNs, "id") || sheetNode.getAttribute("r:id");
  const relation = Array.from(rels.getElementsByTagNameNS(pkgNs, "Relationship")).find((node) => node.getAttribute("Id") === rid);
  const target = relation.getAttribute("Target").replaceAll("\\", "/");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const sheet = domParser.parseFromString(await zip.file(sheetPath).async("string"));
  const sharedEntry = zip.file("xl/sharedStrings.xml");
  const shared = sharedEntry ? Array.from(domParser.parseFromString(await sharedEntry.async("string")).getElementsByTagNameNS(main, "si")).map((item) => Array.from(item.getElementsByTagNameNS(main, "t")).map((node) => node.textContent || "").join("")) : [];
  return { sheet, sheetPath, shared };
}

function cellsByReference(sheet) {
  return new Map(Array.from(sheet.getElementsByTagNameNS(main, "c")).map((cell) => [cell.getAttribute("r"), cell]));
}

function cellDisplay(cell, shared) {
  if (!cell) return "";
  if (cell.getAttribute("t") === "inlineStr") return Array.from(cell.getElementsByTagNameNS(main, "t")).map((node) => node.textContent || "").join("");
  const value = cell.getElementsByTagNameNS(main, "v")[0]?.textContent || "";
  return cell.getAttribute("t") === "s" ? shared[Number(value)] || "" : value;
}

const samplePath = process.env.AMAZON_SAMPLE_EXCEL;
const extendedSamplePath = process.env.AMAZON_EXTENDED_SAMPLE_EXCEL;
test("真实模板可直接分析并生成保留公式和截图的工作簿", { skip: !samplePath }, async () => {
  const bytes = await fs.readFile(samplePath);
  const source = fileFromBytes(samplePath.split(/[\\/]/).pop(), bytes);
  const plan = await analyzeWorkbook(source, "2026Q2");
  assert.equal(plan.targetQuarter, "2026Q2");
  const values = [89147.4, 15050.27, 1082.56, 3.71, 10909.94, 33616.94];
  const result = makeResult("US", "2026Q2", values, -44526.88);
  const session = approvedSession([result]);
  const output = await writeWorkbook(source, session, new Map([[result.key, { bytes: tinyPng, width: 1, height: 1 }]]));
  assert.ok(output.blob.size > 0);
  const zip = await JSZip.loadAsync(await output.blob.arrayBuffer());
  const workbook = domParser.parseFromString(await zip.file("xl/workbook.xml").async("string"));
  const sheetNode = Array.from(workbook.getElementsByTagNameNS(main, "sheet")).find((node) => node.getAttribute("name") === "2026Q2");
  const rels = domParser.parseFromString(await zip.file("xl/_rels/workbook.xml.rels").async("string"));
  const rid = sheetNode.getAttributeNS(relNs, "id") || sheetNode.getAttribute("r:id");
  const relation = Array.from(rels.getElementsByTagNameNS(pkgNs, "Relationship")).find((node) => node.getAttribute("Id") === rid);
  const sheetPath = `xl/${relation.getAttribute("Target").replaceAll("\\", "/")}`;
  const sheet = domParser.parseFromString(await zip.file(sheetPath).async("string"));
  const cells = Array.from(sheet.getElementsByTagNameNS(main, "c"));
  const commission = cells.find((cell) => cell.getAttribute("r") === "J3");
  assert.equal(commission.getElementsByTagNameNS(main, "f")[0].textContent, "ABS(-44526.88)-I3");
  assert.ok(sheet.getElementsByTagNameNS(main, "drawing").length >= 1);
  assert.ok(Object.keys(zip.files).some((name) => /^xl\/media\/amazon_report_\d+\.png$/.test(name)));
});

test("无公司工作簿也能导出预览式解析汇总表", async () => {
  const us = makeResult("US", "2026Q2", [120, 10, 2, 1, 8, 42], -50);
  const jp = makeResult("JP", "2026Q2", [1200, 100, 20, 0, 300, 700.005], -1000.005);
  const images = new Map([
    [jp.key, { bytes: tinyPng, width: 900, height: 1600 }],
    [us.key, { bytes: tinyPng, width: 900, height: 1600 }],
  ]);
  const output = await createSummaryWorkbook(approvedSession([jp, us]), images);
  assert.equal(output.summaryOnly, true);
  assert.equal(output.imageCount, 2);
  assert.match(output.fileName, /^2026Q2-HY-/);
  const zip = await JSZip.loadAsync(await output.blob.arrayBuffer());
  const sheet = domParser.parseFromString(await zip.file("xl/worksheets/sheet1.xml").async("string"));
  const cells = cellsByReference(sheet);
  assert.equal(cellDisplay(cells.get("A4"), []), "日本 (JP)");
  assert.equal(cellDisplay(cells.get("A5"), []), "美国 (US)");
  assert.equal(cellDisplay(cells.get("C4"), []), "1200");
  assert.equal(cells.get("H4").getElementsByTagNameNS(main, "f")[0].textContent, "ABS(-1000.005)-G4");
  assert.equal(cells.get("H5").getElementsByTagNameNS(main, "f")[0].textContent, "ABS(-50)-G5");
  assert.equal(Array.from(sheet.getElementsByTagNameNS(main, "row")).find((row) => row.getAttribute("r") === "4").getAttribute("ht"), "260");
  assert.ok(sheet.getElementsByTagNameNS(main, "drawing").length >= 1);
  assert.equal(Object.keys(zip.files).filter((name) => /^xl\/media\/amazon_report_\d+\.png$/.test(name)).length, 2);
  const drawingPath = Object.keys(zip.files).find((name) => /^xl\/drawings\/drawing\d+\.xml$/.test(name));
  const drawing = domParser.parseFromString(await zip.file(drawingPath).async("string"));
  const columns = Array.from(drawing.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing", "col")).map((node) => node.textContent);
  assert.deepEqual(columns, ["8", "8"]);
});

test("复制季度时会清空所有模板国家旧值，而不只清空本次上传国家", { skip: !samplePath }, async () => {
  const bytes = await fs.readFile(samplePath);
  const source = fileFromBytes(samplePath.split(/[\\/]/).pop(), bytes);
  const ca = makeResult("CA", "2099Q1", [600, 20, 3, 0, 10, 40], -50);
  const output = await writeWorkbook(source, approvedSession([ca]), new Map());
  const zip = await JSZip.loadAsync(await output.blob.arrayBuffer());
  const { sheet, shared } = await sheetPackage(zip, "2099Q1");
  const cells = cellsByReference(sheet);
  const rows = Array.from(sheet.getElementsByTagNameNS(main, "row")).map((row) => {
    const rowNumber = Number(row.getAttribute("r"));
    return { row: rowNumber, marketplace: cellDisplay(cells.get(`B${rowNumber}`), shared), countryName: cellDisplay(cells.get(`C${rowNumber}`), shared), currency: cellDisplay(cells.get(`D${rowNumber}`), shared) };
  });
  const caRow = findCountryRow(rows, "CA");
  const usRow = findCountryRow(rows, "US");
  assert.equal(cellDisplay(cells.get(`E${caRow}`), shared), "600");
  for (let column = 5; column <= 11; column += 1) assert.equal(cellDisplay(cells.get(`${String.fromCharCode(64 + column)}${usRow}`), shared), "");
  for (let column = 13; column <= 18; column += 1) {
    const value = cellDisplay(cells.get(`${String.fromCharCode(64 + column)}${usRow}`), shared);
    assert.ok(value === "" || value === "0");
  }
});

test("工作簿缺少已上传国家时会自动在末尾追加并写入", { skip: !samplePath }, async () => {
  const original = await fs.readFile(samplePath);
  const zip = await JSZip.loadAsync(original);
  const { sheet, sheetPath, shared } = await sheetPackage(zip, "2026Q2");
  const cells = cellsByReference(sheet);
  const rows = Array.from(sheet.getElementsByTagNameNS(main, "row")).map((row) => {
    const rowNumber = Number(row.getAttribute("r"));
    return { row: rowNumber, marketplace: cellDisplay(cells.get(`B${rowNumber}`), shared), countryName: cellDisplay(cells.get(`C${rowNumber}`), shared), currency: cellDisplay(cells.get(`D${rowNumber}`), shared) };
  });
  const caRow = findCountryRow(rows, "CA");
  const rowNode = Array.from(sheet.getElementsByTagNameNS(main, "row")).find((row) => Number(row.getAttribute("r")) === caRow);
  rowNode.parentNode.removeChild(rowNode);
  zip.file(sheetPath, new XMLSerializer().serializeToString(sheet));
  const modified = await zip.generateAsync({ type: "uint8array" });
  const source = fileFromBytes("missing-ca.xlsx", modified);
  const ca = makeResult("CA", "2026Q2", [700, 21, 4, 0, 11, 39], -50);
  const output = await writeWorkbook(source, approvedSession([ca]), new Map());
  assert.match(output.statuses[ca.key], /^APPENDED_/);
  const resultZip = await JSZip.loadAsync(await output.blob.arrayBuffer());
  const resultSheet = await sheetPackage(resultZip, "2026Q2");
  const resultCells = cellsByReference(resultSheet.sheet);
  const appendedRow = Math.max(...Array.from(resultSheet.sheet.getElementsByTagNameNS(main, "row")).map((row) => Number(row.getAttribute("r"))));
  assert.equal(cellDisplay(resultCells.get(`B${appendedRow}`), resultSheet.shared), "amazon.ca");
  assert.equal(cellDisplay(resultCells.get(`C${appendedRow}`), resultSheet.shared), "加拿大");
  assert.equal(cellDisplay(resultCells.get(`D${appendedRow}`), resultSheet.shared), "CAD");
  assert.equal(cellDisplay(resultCells.get(`E${appendedRow}`), resultSheet.shared), "700");
});

test("全零国家写入数值 0、补齐站点币种并嵌入截图", { skip: !extendedSamplePath }, async () => {
  const bytes = await fs.readFile(extendedSamplePath);
  const source = fileFromBytes(extendedSamplePath.split(/[\\/]/).pop(), bytes);
  const be = makeResult("BE", "2026Q1", [0, 0, 0, 0, 0, 0], 0);
  const output = await writeWorkbook(source, approvedSession([be]), new Map([[be.key, { bytes: tinyPng, width: 900, height: 1600 }]]));
  assert.equal(output.statuses[be.key], "WRITTEN");
  const zip = await JSZip.loadAsync(await output.blob.arrayBuffer());
  const { sheet, shared } = await sheetPackage(zip, "2026Q1");
  const cells = cellsByReference(sheet);
  const rows = Array.from(sheet.getElementsByTagNameNS(main, "row")).map((row) => {
    const rowNumber = Number(row.getAttribute("r"));
    return { row: rowNumber, marketplace: cellDisplay(cells.get(`B${rowNumber}`), shared), countryName: cellDisplay(cells.get(`C${rowNumber}`), shared), currency: cellDisplay(cells.get(`D${rowNumber}`), shared) };
  });
  const row = findCountryRow(rows, "BE");
  assert.equal(cellDisplay(cells.get(`B${row}`), shared), "amazon.be");
  assert.equal(cellDisplay(cells.get(`D${row}`), shared), "EUR");
  for (const column of ["E", "F", "G", "H", "I", "J"]) assert.equal(cellDisplay(cells.get(`${column}${row}`), shared), "0");
  assert.match(cells.get(`J${row}`).getElementsByTagNameNS(main, "f")[0].textContent, /^ABS\(0\)-I\d+$/);
  assert.ok(Object.keys(zip.files).some((name) => /^xl\/media\/amazon_report_\d+\.png$/.test(name)));
});

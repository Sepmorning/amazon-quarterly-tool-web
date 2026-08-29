import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import JSZip from "jszip";
import { COUNTRIES, FIELD_COLUMNS, TARGET_FIELDS } from "./config.js";
import { DECISIONS, finalValue } from "./review.js";

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const XDR_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const SHEET_REL_TYPE = `${DOC_REL_NS}/worksheet`;
const DRAWING_REL_TYPE = `${DOC_REL_NS}/drawing`;
const IMAGE_REL_TYPE = `${DOC_REL_NS}/image`;
const TEMPLATE_NAMES = ["季度模板", "模板"];
const parser = new DOMParser();
const serializer = new XMLSerializer();

function xml(text) {
  const document = parser.parseFromString(text, "application/xml");
  const error = document.getElementsByTagName("parsererror")[0];
  if (error) throw new Error(`工作簿 XML 解析失败：${error.textContent}`);
  return document;
}

function xmlText(document) {
  const body = serializer.serializeToString(document);
  return body.startsWith("<?xml") ? body : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;
}

function elements(parent, namespace, localName) {
  return Array.from(parent.getElementsByTagNameNS(namespace, localName));
}

function directChildren(parent, namespace, localName) {
  return Array.from(parent.childNodes).filter((node) => node.nodeType === 1 && node.namespaceURI === namespace && node.localName === localName);
}

function firstDirect(parent, namespace, localName) {
  return directChildren(parent, namespace, localName)[0] || null;
}

function create(document, namespace, name, attributes = {}) {
  const node = document.createElementNS(namespace, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "r:id" || key === "r:embed") node.setAttributeNS(DOC_REL_NS, key, String(value));
    else node.setAttribute(key, String(value));
  }
  return node;
}

function resolvePath(base, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = `${base}/${target.replaceAll("\\", "/")}`.split("/");
  const output = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") output.pop();
    else output.push(part);
  }
  return output.join("/");
}

function quarterRank(name) {
  const match = String(name).trim().match(/^(20\d{2})Q([1-4])$/i);
  return match ? Number(match[1]) * 4 + Number(match[2]) - 1 : null;
}

export function planFromSheetNames(sheetNames, targetQuarter) {
  const target = String(targetQuarter).toUpperCase();
  const exact = sheetNames.find((name) => name.toUpperCase() === target);
  if (exact) return { targetQuarter: target, targetExists: true, sourceSheet: exact, sheetNames: [...sheetNames], requiresCreation: false };
  const template = TEMPLATE_NAMES.find((name) => sheetNames.includes(name));
  if (template) return { targetQuarter: target, targetExists: false, sourceSheet: template, sheetNames: [...sheetNames], requiresCreation: true };
  const targetValue = quarterRank(target);
  if (targetValue == null) throw new Error(`季度名称不符合 YYYYQ1–YYYYQ4：${targetQuarter}`);
  const quarters = sheetNames.flatMap((name) => quarterRank(name) == null ? [] : [[quarterRank(name), name]]);
  const previous = quarters.filter(([rank]) => rank < targetValue).sort((a, b) => b[0] - a[0]);
  const source = previous[0]?.[1] ?? quarters.sort((a, b) => Math.abs(a[0] - targetValue) - Math.abs(b[0] - targetValue))[0]?.[1];
  if (!source) throw new Error("工作簿中没有季度模板、模板或可复制的历史季度");
  return { targetQuarter: target, targetExists: false, sourceSheet: source, sheetNames: [...sheetNames], requiresCreation: true };
}

async function loadWorkbook(file) {
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) throw new Error("仅支持 .xlsx 或 .xlsm 工作簿");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const workbookEntry = zip.file("xl/workbook.xml");
  const relsEntry = zip.file("xl/_rels/workbook.xml.rels");
  if (!workbookEntry || !relsEntry) throw new Error("工作簿缺少必要的 OOXML 文件");
  const workbook = xml(await workbookEntry.async("string"));
  const rels = xml(await relsEntry.async("string"));
  return { zip, workbook, rels };
}

export async function analyzeWorkbook(file, targetQuarter) {
  const { workbook } = await loadWorkbook(file);
  const names = elements(workbook, MAIN_NS, "sheet").map((sheet) => sheet.getAttribute("name"));
  return planFromSheetNames(names, targetQuarter);
}

function relationshipMap(rels) {
  return Object.fromEntries(elements(rels, PKG_REL_NS, "Relationship").map((item) => [item.getAttribute("Id"), item.getAttribute("Target")]));
}

async function sharedStrings(zip) {
  const entry = zip.file("xl/sharedStrings.xml");
  if (!entry) return [];
  const document = xml(await entry.async("string"));
  return elements(document, MAIN_NS, "si").map((item) => elements(item, MAIN_NS, "t").map((node) => node.textContent || "").join(""));
}

function cellText(cell, shared) {
  if (!cell) return "";
  if (cell.getAttribute("t") === "inlineStr") return elements(cell, MAIN_NS, "t").map((node) => node.textContent || "").join("");
  const text = firstDirect(cell, MAIN_NS, "v")?.textContent || "";
  if (cell.getAttribute("t") === "s" && text !== "") return shared[Number(text)] || "";
  return text;
}

function columnNumber(reference) {
  const letters = String(reference).toUpperCase().match(/^[A-Z]+/)?.[0];
  if (!letters) throw new Error(`无效单元格引用：${reference}`);
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

function columnName(number) {
  let value = number;
  let output = "";
  while (value) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function sheetRows(sheet, shared) {
  const sheetData = elements(sheet, MAIN_NS, "sheetData")[0];
  if (!sheetData) return [];
  return directChildren(sheetData, MAIN_NS, "row").map((row) => {
    const cells = Object.fromEntries(directChildren(row, MAIN_NS, "c").map((cell) => [columnNumber(cell.getAttribute("r")), cell]));
    return { row: Number(row.getAttribute("r")), marketplace: cellText(cells[2], shared), countryName: cellText(cells[3], shared), currency: cellText(cells[4], shared) };
  });
}

function normalized(value) {
  return String(value ?? "").replace(/\s+/g, "").toLocaleLowerCase();
}

export function findCountryRow(rows, code) {
  const config = COUNTRIES[code.toUpperCase()];
  const aliases = new Set(config.marketplaces.map(normalized));
  const candidates = rows.flatMap((row) => {
    let score = 0;
    if (normalized(row.currency) === normalized(config.currency)) score += 4;
    if (normalized(row.countryName) === normalized(config.displayName)) score += 5;
    if (aliases.has(normalized(row.marketplace))) score += 6;
    return score >= 5 ? [[score, row.row]] : [];
  });
  if (!candidates.length) return null;
  const best = Math.max(...candidates.map(([score]) => score));
  const rowsAtBest = candidates.filter(([score]) => score === best).map(([, row]) => row);
  if (rowsAtBest.length !== 1) throw new Error(`${code} 在工作簿中匹配到多个同分候选行：${rowsAtBest.join(", ")}`);
  return rowsAtBest[0];
}

function nextNumericName(names, prefix, suffix) {
  const used = new Set(names.flatMap((name) => {
    const match = name.match(new RegExp(`^${prefix}(\\d+)\\${suffix}$`));
    return match ? [Number(match[1])] : [];
  }));
  let number = 1;
  while (used.has(number)) number += 1;
  return `${prefix}${number}${suffix}`;
}

function stripUnsupportedCloneLinks(sheet) {
  for (const name of ["drawing", "legacyDrawing", "legacyDrawingHF", "oleObjects", "controls"]) {
    for (const node of elements(sheet, MAIN_NS, name)) if (node.parentNode === sheet.documentElement) node.parentNode.removeChild(node);
  }
}

async function targetSheet(zip, workbook, rels, plan) {
  const targets = relationshipMap(rels);
  const sheets = elements(workbook, MAIN_NS, "sheets")[0];
  const sourceNode = directChildren(sheets, MAIN_NS, "sheet").find((node) => node.getAttribute("name") === plan.sourceSheet);
  if (!sourceNode) throw new Error(`未找到源工作表：${plan.sourceSheet}`);
  const sourceRid = sourceNode.getAttributeNS(DOC_REL_NS, "id") || sourceNode.getAttribute("r:id");
  const sourcePath = resolvePath("xl", targets[sourceRid]);
  const sourceEntry = zip.file(sourcePath);
  if (!sourceEntry) throw new Error(`未找到工作表数据：${sourcePath}`);
  if (!plan.requiresCreation) return { path: sourcePath, sheet: xml(await sourceEntry.async("string")), created: false };

  const existingNames = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).map((name) => name.split("/").pop());
  const basename = nextNumericName(existingNames, "sheet", ".xml");
  const path = `xl/worksheets/${basename}`;
  const sheet = xml(await sourceEntry.async("string"));
  stripUnsupportedCloneLinks(sheet);
  const usedRids = new Set(Object.keys(targets).flatMap((rid) => rid.match(/^rId(\d+)$/)?.[1] ? [Number(rid.slice(3))] : []));
  let ridNumber = 1;
  while (usedRids.has(ridNumber)) ridNumber += 1;
  const newRid = `rId${ridNumber}`;
  const relation = create(rels, PKG_REL_NS, "Relationship", { Id: newRid, Type: SHEET_REL_TYPE, Target: `worksheets/${basename}` });
  rels.documentElement.appendChild(relation);
  const sheetIds = directChildren(sheets, MAIN_NS, "sheet").map((node) => Number(node.getAttribute("sheetId") || 0));
  const newNode = create(workbook, MAIN_NS, "sheet", { name: plan.targetQuarter, sheetId: Math.max(0, ...sheetIds) + 1, "r:id": newRid });
  sheets.insertBefore(newNode, sourceNode.nextSibling);
  const contentTypesEntry = zip.file("[Content_Types].xml");
  const contentTypes = xml(await contentTypesEntry.async("string"));
  contentTypes.documentElement.appendChild(create(contentTypes, CT_NS, "Override", { PartName: `/${path}`, ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" }));
  zip.file("[Content_Types].xml", xmlText(contentTypes));
  return { path, sheet, created: true };
}

function findOrCreateRow(sheet, rowNumber) {
  let sheetData = elements(sheet, MAIN_NS, "sheetData")[0];
  if (!sheetData) {
    sheetData = create(sheet, MAIN_NS, "sheetData");
    sheet.documentElement.appendChild(sheetData);
  }
  for (const row of directChildren(sheetData, MAIN_NS, "row")) {
    const current = Number(row.getAttribute("r"));
    if (current === rowNumber) return row;
    if (current > rowNumber) {
      const created = create(sheet, MAIN_NS, "row", { r: rowNumber });
      sheetData.insertBefore(created, row);
      return created;
    }
  }
  const created = create(sheet, MAIN_NS, "row", { r: rowNumber });
  sheetData.appendChild(created);
  return created;
}

function findOrCreateCell(sheet, rowNumber, column) {
  const row = findOrCreateRow(sheet, rowNumber);
  const reference = `${columnName(column)}${rowNumber}`;
  for (const cell of directChildren(row, MAIN_NS, "c")) {
    const current = columnNumber(cell.getAttribute("r"));
    if (current === column) return cell;
    if (current > column) {
      const created = create(sheet, MAIN_NS, "c", { r: reference });
      row.insertBefore(created, cell);
      return created;
    }
  }
  const created = create(sheet, MAIN_NS, "c", { r: reference });
  row.appendChild(created);
  return created;
}

function clearCell(cell) {
  cell.removeAttribute("t");
  for (const name of ["f", "v", "is"]) for (const child of directChildren(cell, MAIN_NS, name)) cell.removeChild(child);
}

function numberText(value) {
  if (!Number.isFinite(value)) throw new Error(`无效数值：${value}`);
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
}

function writeNumber(cell, value) {
  clearCell(cell);
  const node = create(cell.ownerDocument, MAIN_NS, "v");
  node.appendChild(cell.ownerDocument.createTextNode(numberText(value)));
  cell.appendChild(node);
}

function writeInlineString(cell, value) {
  clearCell(cell);
  cell.setAttribute("t", "inlineStr");
  const inline = create(cell.ownerDocument, MAIN_NS, "is");
  const text = create(cell.ownerDocument, MAIN_NS, "t");
  text.appendChild(cell.ownerDocument.createTextNode(String(value ?? "")));
  inline.appendChild(text);
  cell.appendChild(inline);
}

function writeFormula(cell, formula, cached) {
  clearCell(cell);
  const formulaNode = create(cell.ownerDocument, MAIN_NS, "f");
  formulaNode.appendChild(cell.ownerDocument.createTextNode(formula));
  const valueNode = create(cell.ownerDocument, MAIN_NS, "v");
  valueNode.appendChild(cell.ownerDocument.createTextNode(numberText(cached)));
  cell.appendChild(formulaNode);
  cell.appendChild(valueNode);
}

function numericValue(cell, shared) {
  const value = Number(cellText(cell, shared));
  return Number.isFinite(value) ? value : null;
}

function setFormulaCache(cell, value) {
  let cached = firstDirect(cell, MAIN_NS, "v");
  if (!cached) {
    cached = create(cell.ownerDocument, MAIN_NS, "v");
    cell.appendChild(cached);
  }
  while (cached.firstChild) cached.removeChild(cached.firstChild);
  cached.appendChild(cell.ownerDocument.createTextNode(numberText(value)));
}

function updateDimension(sheet, rowNumber) {
  const dimension = firstDirect(sheet.documentElement, MAIN_NS, "dimension");
  if (!dimension) return;
  const reference = dimension.getAttribute("ref") || "A1";
  const [start, end = start] = reference.split(":");
  const endColumn = end.match(/^[A-Z]+/i)?.[0] || "R";
  const endRow = Number(end.match(/\d+$/)?.[0] || 1);
  if (rowNumber > endRow) dimension.setAttribute("ref", `${start}:${endColumn}${rowNumber}`);
}

function appendCountryRow(sheet, rows, code) {
  const config = COUNTRIES[code];
  const sheetData = elements(sheet, MAIN_NS, "sheetData")[0];
  if (!sheetData) throw new Error("目标工作表缺少 sheetData");
  const existingRows = directChildren(sheetData, MAIN_NS, "row");
  const rowNumber = Math.max(0, ...existingRows.map((row) => Number(row.getAttribute("r") || 0))) + 1;
  const recognizedRows = rows.flatMap((row) => Object.keys(COUNTRIES).some((countryCode) => {
    try { return findCountryRow([row], countryCode) === row.row; } catch { return false; }
  }) ? [row.row] : []);
  const sourceNumber = recognizedRows.sort((left, right) => right - left)[0];
  const sourceRow = sourceNumber == null ? null : existingRows.find((row) => Number(row.getAttribute("r")) === sourceNumber);
  const row = sourceRow ? sourceRow.cloneNode(true) : create(sheet, MAIN_NS, "row");
  row.setAttribute("r", String(rowNumber));
  for (const cell of directChildren(row, MAIN_NS, "c")) {
    const column = columnNumber(cell.getAttribute("r"));
    cell.setAttribute("r", `${columnName(column)}${rowNumber}`);
    clearCell(cell);
  }
  sheetData.appendChild(row);
  writeInlineString(findOrCreateCell(sheet, rowNumber, 2), config.marketplaces[0]);
  writeInlineString(findOrCreateCell(sheet, rowNumber, 3), config.displayName);
  writeInlineString(findOrCreateCell(sheet, rowNumber, 4), config.currency);
  updateDimension(sheet, rowNumber);
  rows.push({ row: rowNumber, marketplace: config.marketplaces[0], countryName: config.displayName, currency: config.currency });
  return rowNumber;
}

function clearCopiedQuarterRows(sheet, rows) {
  const countryRows = new Set(Object.keys(COUNTRIES).flatMap((code) => {
    const row = findCountryRow(rows, code);
    return row == null ? [] : [row];
  }));
  for (const row of countryRows) {
    for (let column = 5; column <= 11; column += 1) clearCell(findOrCreateCell(sheet, row, column));
    for (let column = 13; column <= 18; column += 1) {
      const cell = findOrCreateCell(sheet, row, column);
      if (firstDirect(cell, MAIN_NS, "f")) setFormulaCache(cell, 0);
      else clearCell(cell);
    }
  }
}

function appendDrawingReference(sheet, relationshipId) {
  for (const drawing of elements(sheet, MAIN_NS, "drawing")) if (drawing.parentNode === sheet.documentElement) drawing.parentNode.removeChild(drawing);
  const node = create(sheet, MAIN_NS, "drawing", { "r:id": relationshipId });
  const extensions = firstDirect(sheet.documentElement, MAIN_NS, "extLst");
  if (extensions) sheet.documentElement.insertBefore(node, extensions);
  else sheet.documentElement.appendChild(node);
}

async function addDrawings(zip, sheetPath, sheet, images) {
  if (!images.length) return;
  const drawingNames = Object.keys(zip.files).filter((name) => /^xl\/drawings\/drawing\d+\.xml$/.test(name)).map((name) => name.split("/").pop());
  const drawingName = nextNumericName(drawingNames, "drawing", ".xml");
  const drawingPath = `xl/drawings/${drawingName}`;
  const drawingRelsPath = `xl/drawings/_rels/${drawingName}.rels`;
  const sheetBase = sheetPath.slice(0, sheetPath.lastIndexOf("/"));
  const sheetFile = sheetPath.slice(sheetPath.lastIndexOf("/") + 1);
  const sheetRelsPath = `${sheetBase}/_rels/${sheetFile}.rels`;
  const sheetRelsEntry = zip.file(sheetRelsPath);
  const sheetRels = sheetRelsEntry ? xml(await sheetRelsEntry.async("string")) : xml(`<Relationships xmlns="${PKG_REL_NS}"/>`);
  const usedRids = new Set(elements(sheetRels, PKG_REL_NS, "Relationship").map((node) => node.getAttribute("Id")));
  let ridNumber = 1;
  while (usedRids.has(`rId${ridNumber}`)) ridNumber += 1;
  const drawingRid = `rId${ridNumber}`;
  sheetRels.documentElement.appendChild(create(sheetRels, PKG_REL_NS, "Relationship", { Id: drawingRid, Type: DRAWING_REL_TYPE, Target: `../drawings/${drawingName}` }));
  appendDrawingReference(sheet, drawingRid);

  const drawing = xml(`<xdr:wsDr xmlns:xdr="${XDR_NS}" xmlns:a="${A_NS}" xmlns:r="${DOC_REL_NS}"/>`);
  const drawingRels = xml(`<Relationships xmlns="${PKG_REL_NS}"/>`);
  const usedMedia = new Set(Object.keys(zip.files).filter((name) => name.startsWith("xl/media/")).map((name) => name.split("/").pop()));
  let imageIndex = 0;
  for (const image of images) {
    imageIndex += 1;
    let mediaNumber = 1;
    while (usedMedia.has(`amazon_report_${mediaNumber}.png`)) mediaNumber += 1;
    const mediaName = `amazon_report_${mediaNumber}.png`;
    usedMedia.add(mediaName);
    zip.file(`xl/media/${mediaName}`, image.bytes);
    const imageRid = `rId${imageIndex}`;
    drawingRels.documentElement.appendChild(create(drawingRels, PKG_REL_NS, "Relationship", { Id: imageRid, Type: IMAGE_REL_TYPE, Target: `../media/${mediaName}` }));
    const scale = Math.min(104 / Math.max(image.width, 1), 70 / Math.max(image.height, 1));
    const displayWidth = Math.max(1, Math.round(image.width * scale));
    const displayHeight = Math.max(1, Math.round(image.height * scale));
    const anchor = create(drawing, XDR_NS, "xdr:oneCellAnchor");
    const origin = create(drawing, XDR_NS, "xdr:from");
    for (const [name, value] of [["col", 10], ["colOff", 4 * 9525], ["row", image.row - 1], ["rowOff", 9525]]) {
      const node = create(drawing, XDR_NS, `xdr:${name}`);
      node.appendChild(drawing.createTextNode(String(value)));
      origin.appendChild(node);
    }
    anchor.appendChild(origin);
    anchor.appendChild(create(drawing, XDR_NS, "xdr:ext", { cx: displayWidth * 9525, cy: displayHeight * 9525 }));
    const picture = create(drawing, XDR_NS, "xdr:pic");
    const nonVisual = create(drawing, XDR_NS, "xdr:nvPicPr");
    nonVisual.appendChild(create(drawing, XDR_NS, "xdr:cNvPr", { id: imageIndex, name: `AmazonReport_${imageIndex}`, descr: image.alt }));
    nonVisual.appendChild(create(drawing, XDR_NS, "xdr:cNvPicPr"));
    picture.appendChild(nonVisual);
    const fill = create(drawing, XDR_NS, "xdr:blipFill");
    fill.appendChild(create(drawing, A_NS, "a:blip", { "r:embed": imageRid }));
    const stretch = create(drawing, A_NS, "a:stretch");
    stretch.appendChild(create(drawing, A_NS, "a:fillRect"));
    fill.appendChild(stretch);
    picture.appendChild(fill);
    const shape = create(drawing, XDR_NS, "xdr:spPr");
    const transform = create(drawing, A_NS, "a:xfrm");
    transform.appendChild(create(drawing, A_NS, "a:off", { x: 0, y: 0 }));
    transform.appendChild(create(drawing, A_NS, "a:ext", { cx: displayWidth * 9525, cy: displayHeight * 9525 }));
    shape.appendChild(transform);
    const geometry = create(drawing, A_NS, "a:prstGeom", { prst: "rect" });
    geometry.appendChild(create(drawing, A_NS, "a:avLst"));
    shape.appendChild(geometry);
    picture.appendChild(shape);
    anchor.appendChild(picture);
    anchor.appendChild(create(drawing, XDR_NS, "xdr:clientData"));
    drawing.documentElement.appendChild(anchor);
  }

  zip.file(sheetRelsPath, xmlText(sheetRels));
  zip.file(drawingPath, xmlText(drawing));
  zip.file(drawingRelsPath, xmlText(drawingRels));
  const contentTypes = xml(await zip.file("[Content_Types].xml").async("string"));
  if (!elements(contentTypes, CT_NS, "Override").some((node) => node.getAttribute("PartName") === `/${drawingPath}`)) {
    contentTypes.documentElement.appendChild(create(contentTypes, CT_NS, "Override", { PartName: `/${drawingPath}`, ContentType: "application/vnd.openxmlformats-officedocument.drawing+xml" }));
  }
  if (!elements(contentTypes, CT_NS, "Default").some((node) => node.getAttribute("Extension")?.toLowerCase() === "png")) {
    contentTypes.documentElement.appendChild(create(contentTypes, CT_NS, "Default", { Extension: "png", ContentType: "image/png" }));
  }
  zip.file("[Content_Types].xml", xmlText(contentTypes));
}

function validateSession(session) {
  for (const country of session.countries) {
    const ad = country.fields.advertising;
    const commission = country.fields.commission_service_fee;
    if (ad.decision === DECISIONS.SKIP && ![DECISIONS.SKIP, DECISIONS.MANUAL].includes(commission.decision)) {
      throw new Error(`${country.metadata.countryName}：广告已跳过时，佣金服务费也必须跳过或人工输入`);
    }
  }
}

export async function writeWorkbook(sourceFile, session, reportImages, onProgress = () => {}) {
  validateSession(session);
  const quarters = new Set(session.countries.map((item) => item.metadata.quarter));
  if (quarters.size !== 1) throw new Error("一次只能处理一个季度");
  const quarter = [...quarters][0];
  const { zip, workbook, rels } = await loadWorkbook(sourceFile);
  const names = elements(workbook, MAIN_NS, "sheet").map((sheet) => sheet.getAttribute("name"));
  const plan = planFromSheetNames(names, quarter);
  const target = await targetSheet(zip, workbook, rels, plan);
  const shared = await sharedStrings(zip);
  const rows = sheetRows(target.sheet, shared);
  if (target.created) clearCopiedQuarterRows(target.sheet, rows);
  const rowByKey = new Map();
  const statuses = {};
  const appended = new Set();
  for (const country of session.countries) {
    let row = findCountryRow(rows, country.metadata.country);
    if (row == null) {
      row = appendCountryRow(target.sheet, rows, country.metadata.country);
      appended.add(country.key);
    }
    rowByKey.set(country.key, row);
  }
  const images = [];
  let index = 0;
  for (const country of session.countries) {
    index += 1;
    onProgress(`写入 ${country.metadata.countryName}`, index, session.countries.length);
    const row = rowByKey.get(country.key);
    if (row == null) continue;
    let skipped = false;
    let failed = false;
    for (const fieldName of TARGET_FIELDS) {
      const field = country.fields[fieldName];
      if (field.decision === DECISIONS.SKIP) {
        skipped = true;
        continue;
      }
      const value = finalValue(field);
      if (value == null) {
        statuses[country.key] = `FIELD_VALUE_MISSING:${fieldName}`;
        failed = true;
        break;
      }
      const cell = findOrCreateCell(target.sheet, row, FIELD_COLUMNS[fieldName]);
      if (fieldName === "commission_service_fee" && field.decision === DECISIONS.APPROVED) {
        const subtotal = country.expensesSubtotalDebits;
        if (subtotal == null) throw new Error(`${country.metadata.countryName} 缺少 Expenses subtotal Debits`);
        const decimals = country.metadata.currency === "JPY" ? 0 : 2;
        writeFormula(cell, `ROUND(ABS(${numberText(subtotal)})-I${row},${decimals})`, value);
      } else writeNumber(cell, value);
    }
    if (failed) continue;
    const multiplier = numericValue(findOrCreateCell(target.sheet, row, 12), shared);
    if (multiplier != null) {
      for (let column = 13; column <= 18; column += 1) {
        const input = numericValue(findOrCreateCell(target.sheet, row, column - 8), shared);
        const formulaCell = findOrCreateCell(target.sheet, row, column);
        if (input != null && firstDirect(formulaCell, MAIN_NS, "f")) setFormulaCache(formulaCell, input * multiplier);
      }
    }
    const image = reportImages.get(country.key);
    if (image) {
      images.push({ row, ...image, alt: `Amazon ${country.metadata.quarter} ${country.metadata.countryName} 完整报告截图` });
      statuses[country.key] = `${appended.has(country.key) ? "APPENDED_" : ""}${skipped ? "WRITTEN_WITH_SKIPS" : "WRITTEN"}`;
    } else statuses[country.key] = `${appended.has(country.key) ? "APPENDED_" : ""}DATA_WRITTEN_IMAGE_MISSING`;
  }
  for (const row of new Set(rowByKey.values())) clearCell(findOrCreateCell(target.sheet, row, 11));
  await addDrawings(zip, target.path, target.sheet, images);
  let calc = elements(workbook, MAIN_NS, "calcPr")[0];
  if (!calc) {
    calc = create(workbook, MAIN_NS, "calcPr");
    workbook.documentElement.appendChild(calc);
  }
  calc.setAttribute("calcMode", "auto");
  calc.setAttribute("fullCalcOnLoad", "1");
  calc.setAttribute("forceFullCalc", "1");
  zip.file(target.path, xmlText(target.sheet));
  zip.file("xl/workbook.xml", xmlText(workbook));
  zip.file("xl/_rels/workbook.xml.rels", xmlText(rels));
  const mime = sourceFile.name.toLowerCase().endsWith(".xlsm") ? "application/vnd.ms-excel.sheet.macroEnabled.12" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 }, mimeType: mime }, ({ percent }) => onProgress(`打包工作簿 ${Math.round(percent)}%`, percent, 100));
  const extension = sourceFile.name.match(/\.(xlsx|xlsm)$/i)?.[0] || ".xlsx";
  const stem = sourceFile.name.slice(0, -extension.length);
  return { blob, fileName: `${stem}_${quarter}_自动填充${extension}`, targetSheet: quarter, sourceSheet: plan.sourceSheet, createdSheet: plan.requiresCreation, statuses };
}

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

function summaryCell(reference, value, style = 0) {
  if (value == null) return `<c r="${reference}" s="${style}"/>`;
  if (typeof value === "object" && value.formula) return `<c r="${reference}" s="${style}"><f>${escapeXml(value.formula)}</f><v>${numberText(value.cached)}</v></c>`;
  if (typeof value === "number") return `<c r="${reference}" s="${style}"><v>${numberText(value)}</v></c>`;
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

export async function createSummaryWorkbook(session, onProgress = () => {}) {
  validateSession(session);
  const quarters = new Set(session.countries.map((item) => item.metadata.quarter));
  const stores = new Set(session.countries.map((item) => item.metadata.store));
  if (quarters.size !== 1 || stores.size !== 1) throw new Error("一次只能导出同一季度、同一店铺的数据");
  const quarter = [...quarters][0];
  const store = [...stores][0];
  const headers = ["国家", "币种", "收入", "退款", "佣金返款", "运费返款", "广告", "佣金服务费"];
  const rows = session.countries.map((country, index) => {
    onProgress(`整理 ${country.metadata.countryName}`, index + 1, session.countries.length);
    const rowNumber = index + 4;
    const values = TARGET_FIELDS.map((name) => finalValue(country.fields[name]));
    const commission = country.fields.commission_service_fee;
    if (commission.decision === DECISIONS.APPROVED && country.expensesSubtotalDebits != null && values[4] != null && values[5] != null) {
      const decimals = country.metadata.currency === "JPY" ? 0 : 2;
      values[5] = { formula: `ROUND(ABS(${numberText(country.expensesSubtotalDebits)})-G${rowNumber},${decimals})`, cached: finalValue(commission) };
    }
    const cells = [
      summaryCell(`A${rowNumber}`, `${country.metadata.countryName} (${country.metadata.country})`, 3),
      summaryCell(`B${rowNumber}`, country.metadata.currency, 3),
      ...values.map((value, fieldIndex) => summaryCell(`${columnName(fieldIndex + 3)}${rowNumber}`, value, country.metadata.currency === "JPY" ? 5 : 4)),
    ];
    return `<row r="${rowNumber}" ht="22" customHeight="1">${cells.join("")}</row>`;
  }).join("");
  const lastRow = session.countries.length + 3;
  const generatedAt = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${MAIN_NS}"><dimension ref="A1:H${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="2" width="11" customWidth="1"/><col min="3" max="8" width="18" customWidth="1"/></cols><sheetData><row r="1" ht="34" customHeight="1">${summaryCell("A1", "Amazon 季度交易数据解析汇总", 1)}</row><row r="2" ht="24" customHeight="1">${summaryCell("A2", `${quarter} · 店铺 ${store} · ${session.countries.length} 个国家 · 生成于 ${generatedAt}`, 2)}</row><row r="3" ht="26" customHeight="1">${headers.map((header, index) => summaryCell(`${columnName(index + 1)}3`, header, 2)).join("")}</row>${rows}</sheetData><autoFilter ref="A3:H${lastRow}"/><mergeCells count="2"><mergeCell ref="A1:H1"/><mergeCell ref="A2:H2"/></mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${MAIN_NS}"><fonts count="4"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><color rgb="FF172033"/><name val="Microsoft YaHei"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD6DFEA"/></left><right style="thin"><color rgb="FFD6DFEA"/></right><top style="thin"><color rgb="FFD6DFEA"/></top><bottom style="thin"><color rgb="FFD6DFEA"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${CT_NS}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${DOC_REL_NS}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${DOC_REL_NS}/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${MAIN_NS}" xmlns:r="${DOC_REL_NS}"><sheets><sheet name="解析汇总" sheetId="1" r:id="rId1"/></sheets><calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${SHEET_REL_TYPE}" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${DOC_REL_NS}/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", sheet);
  zip.file("xl/styles.xml", styles);
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Amazon 季度交易数据解析汇总</dc:title><dc:creator>Amazon 季度数据工具</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Amazon 季度数据工具</Application></Properties>`);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 }, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, ({ percent }) => onProgress(`打包汇总表 ${Math.round(percent)}%`, percent, 100));
  return { blob, fileName: `${quarter}-${store}-Amazon季度解析汇总.xlsx`, targetSheet: "解析汇总", sourceSheet: null, createdSheet: true, summaryOnly: true, statuses: Object.fromEntries(session.countries.map((country) => [country.key, "SUMMARY_WRITTEN"])) };
}

export const OOXML_NAMESPACES = Object.freeze({ MAIN_NS, DOC_REL_NS, PKG_REL_NS, XDR_NS });

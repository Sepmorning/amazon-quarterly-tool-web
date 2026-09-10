import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { TARGET_FIELDS } from "../src/config.js";
import { extractPdf, parseFilename } from "../src/parser.js";

const sampleDirs = (process.env.AMAZON_SAMPLE_PDF_DIRS || process.env.AMAZON_SAMPLE_PDF_DIR || "").split(path.delimiter).filter(Boolean);
const expected = {
  US: [89147.40, 15050.27, 1082.56, 3.71, 10909.94, 33616.94],
  CA: [6984.66, 2577.95, 35.61, 0, 202.28, 2986.05],
  MX: [4769.24, 509.22, 0, 0, 0, 2193.79],
  BR: [576.81, 0, 0, 0, 0, 337.46],
  JP: [1363603, 393794, 0, 0, 114318, 414163],
  DE: [621.81, 39.55, 0, 0, 77.83, 114.24],
  UK: [12955.03, 2413.52, 44.05, 0, 731.23, 3395.35],
};

test("七国真实 PDF 回归值与桌面版一致", { skip: !sampleDirs.length, timeout: 120000 }, async () => {
  const files = (await Promise.all(sampleDirs.map(async (directory) => (await fs.readdir(directory)).filter((name) => /^2026Q2-HY-[A-Z]{2}-.*\.pdf$/i.test(name)).map((name) => ({ directory, name }))))).flat();
  assert.equal(files.length, 7);
  for (const { directory, name } of files) {
    const bytes = await fs.readFile(path.join(directory, name));
    const file = { name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    const country = parseFilename(name).country;
    const result = await extractPdf(file);
    assert.deepEqual(TARGET_FIELDS.map((field) => result.fields[field].value), expected[country], country);
    assert.equal(result.health, "GOOD", country);
    assert.equal(result.incomeValidation.status, "PASS", country);
    assert.equal(result.expensesValidation.status, "PASS", country);
    await result.pdf.destroy();
  }
});

const extendedRoot = process.env.AMAZON_EXTENDED_SAMPLE_ROOT;
const extendedExpected = {
  "2026Q1-ES": [0, 0, 0, 0, 0, 0],
  "2026Q1-FR": [590.78, 23.92, 4.31, 0, 0, 273.01],
  "2026Q1-IE": [110.12, 0, 0, 0, 0, 45.12],
  "2026Q1-IT": [611.34, 99.94, 18.29, 0, 0, 287.52],
  "2026Q1-KR": [822.05, 39.2, 0, 40.83, 0, 421.1],
  "2026Q1-NL": [164.15, 54.79, 5.87, 4.98, 0, 63.18],
  "2026Q2-BE": [0, 0, 0, 0, 0, 0],
  "2026Q2-ES": [294.98, 0, 0, 0, 0, 190.92],
  "2026Q2-FR": [416.51, 20, 3.6, 0, 0, 219.32],
  "2026Q2-IE": [1669.09, 0, 0, 0, 0, 521.76],
  "2026Q2-IT": [365.73, 71.3, 13.05, 0, 0, 170.1],
  "2026Q2-NL": [56.6, 0, 0, 0, 0, 27.94],
  "2026Q2-PL": [0, 0, 0, 0, 0, 0],
  "2026Q2-SE": [2211.98, 0, 0, 0, 0, 1289.61],
};

test("新增欧洲站真实 PDF 与已填工作簿一致", { skip: !extendedRoot, timeout: 120000 }, async () => {
  let checked = 0;
  for (const quarter of ["2026Q1", "2026Q2"]) {
    const directory = path.join(extendedRoot, quarter);
    for (const name of (await fs.readdir(directory)).filter((item) => item.toLowerCase().endsWith(".pdf"))) {
      const sourceCountry = name.match(/^\d{4}Q[1-4]-[^-]+-([A-Z]{2})-/i)?.[1]?.toUpperCase();
      const key = `${quarter}-${sourceCountry}`;
      if (!extendedExpected[key]) continue;
      const bytes = await fs.readFile(path.join(directory, name));
      const file = { name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
      const result = await extractPdf(file);
      assert.deepEqual(TARGET_FIELDS.map((field) => result.fields[field].value), extendedExpected[key], key);
      assert.equal(result.metadata.country, sourceCountry === "KR" ? "SE" : sourceCountry, key);
      assert.equal(result.health, "GOOD", key);
      assert.equal(result.incomeValidation.status, "PASS", key);
      assert.equal(result.expensesValidation.status, "PASS", key);
      if (["2026Q1-ES", "2026Q2-BE", "2026Q2-PL"].includes(key)) {
        assert.ok(TARGET_FIELDS.every((field) => result.fields[field].status === "VERIFIED_ZERO"), key);
      }
      checked += 1;
      await result.pdf.destroy();
    }
  }
  assert.equal(checked, Object.keys(extendedExpected).length);
});

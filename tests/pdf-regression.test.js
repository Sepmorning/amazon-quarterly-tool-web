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

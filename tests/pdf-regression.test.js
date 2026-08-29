import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { TARGET_FIELDS } from "../src/config.js";
import { extractPdf, parseFilename } from "../src/parser.js";

const sampleDir = process.env.AMAZON_SAMPLE_PDF_DIR;
const expected = {
  US: [89147.40, 15050.27, 1082.56, 3.71, 10909.94, 33616.94],
  CA: [6984.66, 2577.95, 35.61, 0, 202.28, 2986.05],
  MX: [4769.24, 509.22, 0, 0, 0, 2193.79],
  BR: [576.81, 0, 0, 0, 0, 337.46],
  JP: [1363603, 393794, 0, 0, 114318, 414163],
  DE: [621.81, 39.55, 0, 0, 77.83, 114.24],
  UK: [12955.03, 2413.52, 44.05, 0, 731.23, 3395.35],
};

test("七国真实 PDF 回归值与桌面版一致", { skip: !sampleDir, timeout: 120000 }, async () => {
  const names = (await fs.readdir(sampleDir)).filter((name) => name.toLowerCase().endsWith(".pdf"));
  assert.equal(names.length, 7);
  for (const name of names) {
    const bytes = await fs.readFile(path.join(sampleDir, name));
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

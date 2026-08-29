import test from "node:test";
import assert from "node:assert/strict";
import { countryConfig } from "../src/config.js";
import { extractPageSnapshot, parseAmount, parseFilename } from "../src/parser.js";

function word(text, x0, top, width = 58, height = 10) {
  return { text, x0, x1: x0 + width, top, bottom: top + height, centerX: x0 + width / 2 };
}

test("解析季度 PDF 文件名", () => {
  assert.deepEqual(parseFilename("2026Q2-HY-US-2026Apr1-2026Jun30CustomSummary.pdf"), { quarter: "2026Q2", store: "HY", country: "US" });
  assert.throws(() => parseFilename("report.pdf"), /文件名不符合/);
});

test("金额解析覆盖英文和欧洲格式", () => {
  assert.equal(parseAmount("-3,188.33", countryConfig("US")), -3188.33);
  assert.equal(parseAmount("(1,234.50)", countryConfig("US")), -1234.5);
  assert.equal(parseAmount("1.234,56 €", countryConfig("DE")), 1234.56);
});

test("从双栏明细快照提取六个字段并计算佣金服务费", () => {
  const words = [
    word("Income", 60, 30), word("4,406.71", 710, 30, 70),
    word("Expenses", 450, 45), word("3,151.31", 710, 45, 70),
    word("Income", 60, 100), word("Expenses", 440, 100),
    word("Debits", 250, 125), word("Credits", 340, 125), word("Debits", 610, 125), word("Credits", 700, 125),
    word("Selling", 450, 165), word("fee", 505, 165, 22), word("refunds", 532, 165, 45), word("35.61", 700, 165, 45),
    word("FBA", 450, 190, 25), word("transaction", 480, 190, 60), word("fee", 545, 190, 22), word("refunds", 572, 190, 45), word("0", 700, 190, 10),
    word("Cost", 450, 215, 28), word("of", 482, 215, 15), word("Advertising", 502, 215, 70), word("-202.28", 610, 215, 55),
    word("subtotals", 120, 260, 60), word("-2,577.95", 250, 260, 72), word("6,984.66", 340, 260, 70),
    word("subtotals", 500, 260, 60), word("-3,188.33", 610, 260, 72), word("37.02", 700, 260, 45),
  ];
  const result = extractPageSnapshot({ pageIndex: 0, width: 800, height: 500, words }, countryConfig("US"));
  assert.deepEqual(Object.values(result.fields).map((field) => field.value), [6984.66, 2577.95, 35.61, 0, 202.28, 2986.05]);
  assert.equal(result.incomeValidation.status, "PASS");
  assert.equal(result.expensesValidation.status, "PASS");
});

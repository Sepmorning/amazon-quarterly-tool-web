import test from "node:test";
import assert from "node:assert/strict";
import { TARGET_FIELDS } from "../src/config.js";
import { DECISIONS, createReviewSession, firstUnresolved, move, setDecision, undo } from "../src/review.js";

function result(code) {
  return {
    key: `2026Q2-HY-${code}`,
    metadata: { quarter: "2026Q2", store: "HY", country: code, countryName: code, currency: "USD" },
    expensesSubtotalDebits: -100,
    incomeValidation: { status: "PASS" },
    expensesValidation: { status: "PASS" },
    health: "GOOD",
    fields: Object.fromEntries(TARGET_FIELDS.map((name, index) => [name, { name, status: "FOUND", value: name === "advertising" ? 10 : 20 + index }])),
  };
}

test("顺序审核可向上返回，跨国家时保持线性顺序", () => {
  const session = createReviewSession([result("CA"), result("US")]);
  let cursor = firstUnresolved(session);
  assert.deepEqual(cursor, ["2026Q2-HY-CA", "income"]);
  setDecision(session, cursor[0], cursor[1], DECISIONS.APPROVED);
  cursor = move(session, cursor, 1);
  assert.deepEqual(cursor, ["2026Q2-HY-CA", "refund"]);
  assert.deepEqual(move(session, cursor, -1), ["2026Q2-HY-CA", "income"]);
  for (const name of TARGET_FIELDS.slice(1)) setDecision(session, "2026Q2-HY-CA", name, DECISIONS.APPROVED);
  assert.deepEqual(move(session, ["2026Q2-HY-CA", TARGET_FIELDS.at(-1)], 1), ["2026Q2-HY-US", "income"]);
  assert.deepEqual(move(session, ["2026Q2-HY-US", "income"], -1), ["2026Q2-HY-CA", TARGET_FIELDS.at(-1)]);
});

test("确认广告后佣金候选值自动重算，撤销可完整恢复", () => {
  const session = createReviewSession([result("US")]);
  setDecision(session, "2026Q2-HY-US", "advertising", DECISIONS.MANUAL, 25);
  assert.equal(session.countries[0].fields.commission_service_fee.suggestedValue, 75);
  undo(session);
  assert.equal(session.countries[0].fields.advertising.decision, null);
  assert.equal(session.countries[0].fields.commission_service_fee.suggestedValue, null);
});

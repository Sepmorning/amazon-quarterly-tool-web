import { TARGET_FIELDS } from "./config.js";
import { subtractAbsAmounts } from "./amounts.js";

export const DECISIONS = Object.freeze({ APPROVED: "APPROVED", CONFIRMED_ZERO: "CONFIRMED_ZERO", MANUAL: "MANUAL", SKIP: "SKIP" });

export function createReviewSession(results, failures = []) {
  const countries = results
    .slice()
    .sort((a, b) => `${a.metadata.quarter}-${a.metadata.store}-${a.metadata.country}`.localeCompare(`${b.metadata.quarter}-${b.metadata.store}-${b.metadata.country}`))
    .map((result) => ({
      ...result,
      fields: Object.fromEntries(TARGET_FIELDS.map((name) => [name, { ...result.fields[name], decision: null, manualValue: null, suggestedValue: null }])),
    }));
  return { countries, failures, history: [], previewed: false };
}

export function reviewItems(session) {
  return session.countries.flatMap((country) => TARGET_FIELDS.map((fieldName) => [country.key, fieldName]));
}

export function countryByKey(session, key) {
  const country = session.countries.find((item) => item.key === key);
  if (!country) throw new Error(`未知国家：${key}`);
  return country;
}

export function finalValue(field) {
  if (field.decision === DECISIONS.APPROVED) return field.suggestedValue ?? field.value;
  if (field.decision === DECISIONS.CONFIRMED_ZERO) return 0;
  if (field.decision === DECISIONS.MANUAL) return field.manualValue;
  return null;
}

export function setDecision(session, countryKey, fieldName, decision, manualValue = null) {
  const country = countryByKey(session, countryKey);
  const field = country.fields[fieldName];
  if (!field || !Object.values(DECISIONS).includes(decision)) throw new Error("无效审核决定");
  if (decision === DECISIONS.APPROVED && field.value == null && field.suggestedValue == null) throw new Error("提取值为空，不能直接确认");
  if (decision === DECISIONS.MANUAL) {
    const parsed = Number(manualValue);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error("请输入不小于 0 的有效金额");
    manualValue = parsed;
  } else manualValue = null;
  session.history.push({ countryKey, fieldName, decision: field.decision, manualValue: field.manualValue, suggestedValue: field.suggestedValue, commission: fieldName === "advertising" ? { ...country.fields.commission_service_fee } : null });
  field.decision = decision;
  field.manualValue = manualValue;
  if (fieldName === "advertising" && decision !== DECISIONS.SKIP) {
    const advertising = finalValue(field);
    const subtotal = country.expensesSubtotalDebits;
    if (advertising == null || subtotal == null) throw new Error("广告或 Expenses subtotal Debits 不可用");
    const recalculated = subtractAbsAmounts(subtotal, advertising);
    if (recalculated < 0) throw new Error("重新计算的佣金服务费为负数，请人工核对");
    const commission = country.fields.commission_service_fee;
    commission.suggestedValue = recalculated;
    commission.decision = null;
    commission.manualValue = null;
  }
  session.previewed = false;
}

export function undo(session) {
  const previous = session.history.pop();
  if (!previous) return null;
  const country = countryByKey(session, previous.countryKey);
  Object.assign(country.fields[previous.fieldName], { decision: previous.decision, manualValue: previous.manualValue, suggestedValue: previous.suggestedValue });
  if (previous.commission) Object.assign(country.fields.commission_service_fee, previous.commission);
  session.previewed = false;
  return [previous.countryKey, previous.fieldName];
}

export function firstUnresolved(session) {
  return reviewItems(session).find(([key, field]) => !countryByKey(session, key).fields[field].decision) || null;
}

export function isReachable(session, target) {
  const items = reviewItems(session);
  const targetIndex = items.findIndex(([key, field]) => key === target[0] && field === target[1]);
  if (targetIndex < 0) return false;
  const frontier = firstUnresolved(session);
  if (!frontier) return true;
  const frontierIndex = items.findIndex(([key, field]) => key === frontier[0] && field === frontier[1]);
  return targetIndex <= frontierIndex;
}

export function move(session, current, direction) {
  const items = reviewItems(session);
  if (!items.length) return null;
  const index = items.findIndex(([key, field]) => key === current?.[0] && field === current?.[1]);
  if (index < 0) return items[0];
  const nextIndex = Math.max(0, Math.min(items.length - 1, index + direction));
  const target = items[nextIndex];
  return isReachable(session, target) ? target : current;
}

export function allReviewed(session) {
  return !firstUnresolved(session) && session.countries.length > 0;
}

export function reviewSummary(session) {
  const counts = { APPROVED: 0, CONFIRMED_ZERO: 0, MANUAL: 0, SKIP: 0, unresolved: 0 };
  for (const country of session.countries) {
    for (const name of TARGET_FIELDS) {
      const decision = country.fields[name].decision;
      if (decision) counts[decision] += 1;
      else counts.unresolved += 1;
    }
  }
  return { countries: session.countries.length, fields: session.countries.length * TARGET_FIELDS.length, failures: session.failures.length, ...counts };
}

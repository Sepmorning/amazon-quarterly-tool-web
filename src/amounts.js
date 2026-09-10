function decimalPlaces(value) {
  const [coefficient, exponentText] = String(Math.abs(value)).toLowerCase().split("e");
  const fractionLength = coefficient.split(".")[1]?.length || 0;
  const exponent = Number(exponentText || 0);
  return Math.max(0, fractionLength - exponent);
}

export function subtractAbsAmounts(debit, deduction) {
  if (!Number.isFinite(debit) || !Number.isFinite(deduction)) {
    throw new Error("金额不可用，无法计算佣金服务费");
  }
  const precision = Math.max(decimalPlaces(debit), decimalPlaces(deduction));
  const scale = 10 ** precision;
  const debitUnits = Math.round(Math.abs(debit) * scale);
  const deductionUnits = Math.round(deduction * scale);
  if (!Number.isSafeInteger(debitUnits) || !Number.isSafeInteger(deductionUnits)) {
    return Math.abs(debit) - deduction;
  }
  return (debitUnits - deductionUnits) / scale;
}

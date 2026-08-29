export const TARGET_FIELDS = Object.freeze([
  "income",
  "refund",
  "selling_fee_refund",
  "fba_transaction_fee_refund",
  "advertising",
  "commission_service_fee",
]);

export const FIELD_LABELS = Object.freeze({
  income: "收入",
  refund: "退款",
  selling_fee_refund: "佣金返款",
  fba_transaction_fee_refund: "运费返款",
  advertising: "广告",
  commission_service_fee: "佣金服务费",
});

export const FIELD_COLUMNS = Object.freeze({
  income: 5,
  refund: 6,
  selling_fee_refund: 7,
  fba_transaction_fee_refund: 8,
  advertising: 9,
  commission_service_fee: 10,
});

const englishAliases = {
  income_section: ["Income"],
  expenses_section: ["Expenses"],
  subtotal: ["subtotals", "subtotal"],
  selling_fee_refund: ["Selling fee refunds", "Selling fee refund"],
  fba_transaction_fee_refund: [
    "FBA transaction fee refunds",
    "FBA transaction fee refund",
  ],
  advertising: ["Cost of Advertising"],
  debits: ["Debits", "Debit"],
  credits: ["Credits", "Credit"],
};

export const COUNTRIES = Object.freeze({
  US: {
    code: "US",
    displayName: "美国",
    currency: "USD",
    decimalSeparator: ".",
    thousandsSeparator: ",",
    aliases: englishAliases,
    marketplaces: ["amazon.com"],
  },
  CA: {
    code: "CA",
    displayName: "加拿大",
    currency: "CAD",
    decimalSeparator: ".",
    thousandsSeparator: ",",
    aliases: englishAliases,
    marketplaces: ["amazon.ca"],
  },
  UK: {
    code: "UK",
    displayName: "英国",
    currency: "GBP",
    decimalSeparator: ".",
    thousandsSeparator: ",",
    aliases: englishAliases,
    marketplaces: ["amazon.uk", "amazon.co.uk"],
  },
  DE: {
    code: "DE",
    displayName: "德国",
    currency: "EUR",
    decimalSeparator: ",",
    thousandsSeparator: ".",
    aliases: {
      income_section: ["Einnahmen"],
      expenses_section: ["Ausgaben"],
      subtotal: ["Zwischensummen", "Zwischensumme"],
      selling_fee_refund: ["Erstattungen zur Verkaufsgebühr"],
      fba_transaction_fee_refund: [
        "Erstattungen zur Transaktionsgebühr - Versand durch Amazon",
      ],
      advertising: ["Werbekosten"],
      debits: ["Belastungen", "Belastung"],
      credits: ["Einnahmen"],
    },
    marketplaces: ["amazon.de"],
  },
  JP: {
    code: "JP",
    displayName: "日本",
    currency: "JPY",
    decimalSeparator: ".",
    thousandsSeparator: ",",
    aliases: {
      income_section: ["収入"],
      expenses_section: ["支出"],
      subtotal: ["小計"],
      selling_fee_refund: ["出品手数料の返金額"],
      fba_transaction_fee_refund: ["FBA 配送代行手数料の返金額"],
      advertising: ["広告費用"],
      debits: ["支払額"],
      credits: ["入金額"],
    },
    marketplaces: ["amazon.co.jp"],
  },
  MX: {
    code: "MX",
    displayName: "墨西哥",
    currency: "MXN",
    decimalSeparator: ".",
    thousandsSeparator: ",",
    aliases: {
      income_section: ["Ingresos"],
      expenses_section: ["Gastos"],
      subtotal: ["subtotales", "subtotal"],
      selling_fee_refund: ["Reembolsos de tarifa de venta"],
      fba_transaction_fee_refund: ["Reembolsos de tarifas de transacción FBA"],
      advertising: ["Costo de la publicidad"],
      debits: ["Débitos", "Debitos"],
      credits: ["Créditos", "Creditos"],
    },
    marketplaces: ["amazon.com.mx"],
  },
  BR: {
    code: "BR",
    displayName: "巴西",
    currency: "BRL",
    decimalSeparator: ",",
    thousandsSeparator: ".",
    aliases: {
      income_section: ["Rendimento"],
      expenses_section: ["Despesas"],
      subtotal: ["subtotais", "subtotal"],
      selling_fee_refund: ["Reembolsos de taxas de vendas"],
      fba_transaction_fee_refund: ["Reembolsos de taxa de transação do FBA"],
      advertising: ["Custo de Publicidade"],
      debits: ["Débitos", "Debitos"],
      credits: ["Créditos", "Creditos"],
    },
    marketplaces: ["amazon.com.br"],
  },
});

export function countryConfig(code) {
  const config = COUNTRIES[String(code).toUpperCase()];
  if (!config) {
    throw new Error(`不支持的国家代码：${code}`);
  }
  return config;
}

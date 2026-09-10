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

const frenchAliases = {
  income_section: ["Revenus"],
  expenses_section: ["Dépenses"],
  subtotal: ["sous-totaux", "sous-total"],
  selling_fee_refund: [
    "Remboursement des frais de vente",
    "Remboursements des frais de vente",
  ],
  fba_transaction_fee_refund: [
    "Remboursement des frais de transaction Expédié par Amazon",
    "Remboursements des frais de transaction Expédié par Amazon",
  ],
  advertising: ["Prix de la publicité", "Coût de la publicité"],
  debits: ["Débits", "Debit"],
  credits: ["Crédits", "Credit"],
};

const swedishAliases = {
  income_section: ["Intäkter"],
  expenses_section: ["Utgifter"],
  subtotal: ["delsummor", "delsumma"],
  selling_fee_refund: ["Återbetalningar av försäljningsavgift"],
  fba_transaction_fee_refund: ["Återbetalningar av FBA-transaktionsavgift"],
  advertising: ["Reklamkostnad"],
  debits: ["Debiteringar", "Debitering"],
  credits: ["Krediter", "Kredit"],
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
    countryNameAliases: ["巴西（联合报告）", "巴西(联合报告)"],
  },
  FR: {
    code: "FR",
    displayName: "法国",
    currency: "EUR",
    decimalSeparator: ",",
    thousandsSeparator: ".",
    aliases: frenchAliases,
    marketplaces: ["amazon.fr"],
  },
  IT: {
    code: "IT",
    displayName: "意大利",
    currency: "EUR",
    decimalSeparator: ",",
    thousandsSeparator: ".",
    aliases: {
      income_section: ["Ricavi"],
      expenses_section: ["Spese"],
      subtotal: ["Totale parziale"],
      selling_fee_refund: ["Rimborsi per commissioni di vendita"],
      fba_transaction_fee_refund: [
        "Rimborsi commissioni Logistica di Amazon per transazione",
      ],
      advertising: ["Costo della pubblicità"],
      debits: ["Addebiti", "Addebito"],
      credits: ["Accrediti", "Accredito"],
    },
    marketplaces: ["amazon.it"],
  },
  IE: {
    code: "IE",
    displayName: "爱尔兰",
    currency: "EUR",
    decimalSeparator: ".",
    thousandsSeparator: ",",
    aliases: englishAliases,
    marketplaces: ["amazon.ie"],
  },
  SE: {
    code: "SE",
    displayName: "瑞典",
    currency: "SEK",
    decimalSeparator: ",",
    thousandsSeparator: " ",
    aliases: swedishAliases,
    marketplaces: ["amazon.se"],
    filenameAliases: ["KR"],
  },
  NL: {
    code: "NL",
    displayName: "荷兰",
    currency: "EUR",
    decimalSeparator: ",",
    thousandsSeparator: ".",
    aliases: {
      income_section: ["Inkomen"],
      expenses_section: ["Uitgaven"],
      subtotal: ["subtotalen", "subtotaal"],
      selling_fee_refund: ["Terugbetaling van verkoopkosten"],
      fba_transaction_fee_refund: ["Terugbetaling FBA-transactiekosten"],
      advertising: ["Advertentiekosten"],
      debits: ["Debetbetalingen", "Debetbetaling"],
      credits: ["Tegoeden", "Tegoed"],
    },
    marketplaces: ["amazon.nl"],
  },
  ES: {
    code: "ES",
    displayName: "西班牙",
    currency: "EUR",
    decimalSeparator: ",",
    thousandsSeparator: ".",
    aliases: {
      income_section: ["Ingresos"],
      expenses_section: ["Costes", "Gastos"],
      subtotal: ["subtotal", "subtotales"],
      selling_fee_refund: ["Reembolso de tarifas de venta"],
      fba_transaction_fee_refund: [
        "Tarifas de reembolso de transacciones de Logística de Amazon",
        "Reembolsos de tarifas de transacción FBA",
      ],
      advertising: ["Gastos de publicidad", "Costo de la publicidad"],
      debits: ["Débitos", "Debitos"],
      credits: ["Abonos", "Créditos", "Creditos"],
    },
    marketplaces: ["amazon.es"],
  },
  BE: {
    code: "BE",
    displayName: "比利时",
    currency: "EUR",
    decimalSeparator: ",",
    thousandsSeparator: ".",
    aliases: frenchAliases,
    marketplaces: ["amazon.be"],
  },
  PL: {
    code: "PL",
    displayName: "波兰",
    currency: "PLN",
    decimalSeparator: ",",
    thousandsSeparator: " ",
    aliases: {
      income_section: ["Przychód", "Przychod"],
      expenses_section: ["Wydatki"],
      subtotal: ["sumy częściowe", "sumy czciowe"],
      selling_fee_refund: ["Zwroty opłat za sprzedaż", "Zwroty opłat za sprzeda"],
      fba_transaction_fee_refund: ["FBA — zwroty opłat transakcyjnych"],
      advertising: ["Koszt reklamy"],
      debits: ["Obciążenia", "Obcienia"],
      credits: ["Noty kredytowe"],
    },
    marketplaces: ["amazon.pl"],
  },
});

const FILENAME_COUNTRY_ALIASES = Object.freeze(Object.fromEntries(
  Object.values(COUNTRIES).flatMap((config) =>
    (config.filenameAliases || []).map((alias) => [alias.toUpperCase(), config.code]),
  ),
));

export function canonicalCountryCode(code) {
  const normalized = String(code).toUpperCase();
  return FILENAME_COUNTRY_ALIASES[normalized] || normalized;
}

export function countryConfig(code) {
  const config = COUNTRIES[canonicalCountryCode(code)];
  if (!config) {
    throw new Error(`不支持的国家代码：${code}`);
  }
  return config;
}

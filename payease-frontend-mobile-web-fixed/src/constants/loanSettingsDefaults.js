export const DEFAULT_MANDATORY_INSTALLMENTS = 15;
export const DEFAULT_INSTALLMENT_BLOCK_SIZE = 3;
export const DEFAULT_DISCOUNT_PERCENT_PER_BLOCK = 1;
export const DEFAULT_MAXIMUM_DISCOUNT_PERCENT = null;
export const DEFAULT_AGENT_SHARE_PERCENT = 50;
export const DEFAULT_LOAN_DEPARTMENT_SHARE_PERCENT = 50;
export const DEFAULT_LOAN_DEPARTMENT_COMMISSION_PERCENT = 5;
export const DEFAULT_AGENT_COMMISSION_PERCENT = 2;
export const DEFAULT_INVESTMENT_COMMISSION_PERCENT = 2;
export const DEFAULT_ALLOW_PARTIAL_BLOCKS = true;

export const SYSTEM_LOAN_INSTALLMENTS = [
  { count: 15, days: 150, label: "15 Kist (150 Din)", amountLabel: "₹5,000 - ₹1,00,000" },
  { count: 18, days: 180, label: "18 Kist (180 Din)", amountLabel: "₹5,000 - ₹1,00,000" },
  { count: 21, days: 210, label: "21 Kist (210 Din)", amountLabel: "₹5,000 - ₹1,00,000" },
  { count: 24, days: 240, label: "24 Kist (240 Din)", amountLabel: "₹5,000 - ₹1,00,000" }
];

export const SYSTEM_DAILY_TENURES = [
  { count: 60, days: 60, label: "60 Din (Daily)", amountLabel: "₹5,000 - ₹50,000" },
  { count: 80, days: 80, label: "80 Din (Daily)", amountLabel: "₹5,000 - ₹50,000" },
  { count: 100, days: 100, label: "100 Din (Daily)", amountLabel: "₹5,000 - ₹50,000" },
  { count: 120, days: 120, label: "120 Din (Daily)", amountLabel: "₹5,000 - ₹50,000" }
];

export const SYSTEM_LOAN_AMOUNTS = [
  5000, 10000, 15000, 20000, 25000, 30000, 50000, 100000
];

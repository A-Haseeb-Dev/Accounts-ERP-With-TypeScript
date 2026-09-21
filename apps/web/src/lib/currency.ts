export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  locale: string;
  main: string;
  minor: string;
  scale: 'indian' | 'western';
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs', locale: 'en-PK', main: 'Rupees', minor: 'Paisa', scale: 'indian' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', locale: 'en-IN', main: 'Rupees', minor: 'Paise', scale: 'indian' },
  { code: 'USD', name: 'US Dollar', symbol: '$', locale: 'en-US', main: 'Dollars', minor: 'Cents', scale: 'western' },
  { code: 'EUR', name: 'Euro', symbol: '€', locale: 'de-DE', main: 'Euros', minor: 'Cents', scale: 'western' },
  { code: 'GBP', name: 'British Pound', symbol: '£', locale: 'en-GB', main: 'Pounds', minor: 'Pence', scale: 'western' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', locale: 'en-AE', main: 'Dirhams', minor: 'Fils', scale: 'western' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', locale: 'ar-SA', main: 'Riyals', minor: 'Halalas', scale: 'western' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'QAR', locale: 'en-QA', main: 'Riyals', minor: 'Dirhams', scale: 'western' },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KWD', locale: 'en-KW', main: 'Dinars', minor: 'Fils', scale: 'western' },
  { code: 'OMR', name: 'Omani Rial', symbol: 'OMR', locale: 'en-OM', main: 'Rials', minor: 'Baisa', scale: 'western' },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BHD', locale: 'en-BH', main: 'Dinars', minor: 'Fils', scale: 'western' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', locale: 'zh-CN', main: 'Yuan', minor: 'Fen', scale: 'western' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', locale: 'ja-JP', main: 'Yen', minor: 'Sen', scale: 'western' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$', locale: 'en-AU', main: 'Dollars', minor: 'Cents', scale: 'western' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$', locale: 'en-CA', main: 'Dollars', minor: 'Cents', scale: 'western' },
];

let currentCode = 'PKR';

export const setAppCurrency = (code: string): void => {
  if (!code) return;
  currentCode = code.trim().toUpperCase() || 'PKR';
};

export const getAppCurrency = (): string => currentCode;

export const getCurrencyInfo = (code?: string): CurrencyInfo => {
  const c = (code ?? currentCode).toUpperCase();
  return CURRENCIES.find((x) => x.code === c) ?? {
    code: c,
    name: c,
    symbol: c,
    locale: 'en',
    main: c,
    minor: 'Cents',
    scale: 'western',
  };
};
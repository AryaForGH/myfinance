export const LANGUAGES = [
  { code: 'id', locale: 'id-ID', name: 'Bahasa Indonesia', label: 'Indonesia' },
  { code: 'en', locale: 'en-US', name: 'English', label: 'English' },
  { code: 'ms', locale: 'ms-MY', name: 'Bahasa Melayu', label: 'Melayu' },
  { code: 'ja', locale: 'ja-JP', name: '日本語', label: '日本語' },
  { code: 'zh', locale: 'zh-CN', name: '中文', label: '中文' },
]

export const CURRENCIES = [
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
]

export function currencyLabel(code) {
  const currency = CURRENCIES.find((item) => item.code === code)
  return currency ? `${currency.code} · ${currency.name} · ${currency.symbol}` : code
}

export function formatCurrency(value, currency, locale) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
  }).format(Number(value) || 0)
}

export function formatDate(value, locale, options) {
  return new Intl.DateTimeFormat(locale, options).format(new Date(value))
}

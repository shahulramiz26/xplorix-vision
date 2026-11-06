'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

// ── CURRENCY DEFINITIONS ───────────────────────────────────────────────────
export interface Currency {
  code: string
  symbol: string
  name: string
  flag: string
  // Exchange rate relative to USD (1 USD = X currency)
  rate: number
}

export const CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$',  name: 'US Dollar',       flag: '🇺🇸', rate: 1       },
  { code: 'INR', symbol: '₹',  name: 'Indian Rupee',    flag: '🇮🇳', rate: 83.5    },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar',flag: '🇦🇺', rate: 1.53   },
  { code: 'EUR', symbol: '€',  name: 'Euro',             flag: '🇪🇺', rate: 0.92   },
  { code: 'SAR', symbol: '﷼',  name: 'Saudi Riyal',      flag: '🇸🇦', rate: 3.75   },
]

// ── CONTEXT TYPE ───────────────────────────────────────────────────────────
interface CurrencyContextType {
  currency: Currency
  setCurrency: (c: Currency) => void
  format: (usdValue: number) => string
  formatShort: (usdValue: number) => string
}

// ── CONTEXT ────────────────────────────────────────────────────────────────
const CurrencyContext = createContext<CurrencyContextType>({
  currency: CURRENCIES[0],
  setCurrency: () => {},
  format: (v) => `$${v.toFixed(2)}`,
  formatShort: (v) => `$${v.toFixed(0)}`,
})

// ── PROVIDER ───────────────────────────────────────────────────────────────
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>(CURRENCIES[0])

  // Converts a USD base value to selected currency and formats it
  const format = (usdValue: number): string => {
    const converted = usdValue * currency.rate
    // For large numbers use locale formatting
    if (converted >= 1_000_000) {
      return `${currency.symbol}${(converted / 1_000_000).toFixed(2)}M`
    }
    if (converted >= 1_000) {
      return `${currency.symbol}${converted.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    }
    return `${currency.symbol}${converted.toFixed(2)}`
  }

  // Short format for KPI cards (e.g. ₹142.5k)
  const formatShort = (usdValue: number): string => {
    const converted = usdValue * currency.rate
    if (converted >= 10_000_000) return `${currency.symbol}${(converted / 10_000_000).toFixed(1)}Cr`
    if (converted >= 100_000)    return `${currency.symbol}${(converted / 100_000).toFixed(1)}L`
    if (converted >= 1_000)      return `${currency.symbol}${(converted / 1_000).toFixed(1)}k`
    return `${currency.symbol}${converted.toFixed(0)}`
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, format, formatShort }}>
      {children}
    </CurrencyContext.Provider>
  )
}

// ── HOOK ───────────────────────────────────────────────────────────────────
export const useCurrency = () => useContext(CurrencyContext)


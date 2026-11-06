'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { useCurrency, CURRENCIES } from './currency-context'

export default function CurrencySwitcher() {
  const { currency, setCurrency } = useCurrency()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 bg-[rgba(var(--x-ov),0.05)] border border-[color:color-mix(in_srgb,var(--x-border)_50%,transparent)]
                   hover:bg-[rgba(var(--x-ov),0.1)] hover:border-[color:var(--x-dim)] rounded-xl transition-all duration-200
                   text-sm font-medium text-[color:var(--x-text)]"
      >
        <span className="text-base leading-none">{currency.flag}</span>
        <span className="text-[color:var(--x-muted)] font-mono font-semibold">{currency.code}</span>
        <span className="text-[color:var(--x-faint)]">{currency.symbol}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[color:var(--x-faint)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 z-50
                        bg-[var(--x-card)] border border-[color:var(--x-border)] rounded-2xl shadow-2xl
                        shadow-black/40 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[color:var(--x-border)]">
            <p className="text-xs font-semibold text-[color:var(--x-faint)] uppercase tracking-wider">Select Currency</p>
          </div>

          {/* Options */}
          <div className="p-1.5">
            {CURRENCIES.map((c) => {
              const isActive = c.code === currency.code
              return (
                <button
                  key={c.code}
                  onClick={() => { setCurrency(c); setOpen(false) }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150
                    ${isActive
                      ? 'bg-[#0066FF]/15 text-[color:var(--x-text)]'
                      : 'text-[color:var(--x-muted)] hover:bg-[rgba(var(--x-ov),0.05)] hover:text-[color:var(--x-text)]'
                    }`}
                >
                  {/* Flag */}
                  <span className="text-xl leading-none w-7 text-center">{c.flag}</span>

                  {/* Name + code */}
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium leading-tight">{c.name}</div>
                    <div className="text-xs text-[color:var(--x-faint)] font-mono mt-0.5">{c.code}</div>
                  </div>

                  {/* Symbol */}
                  <span className="text-sm font-bold text-[color:var(--x-faint)] font-mono w-6 text-right">{c.symbol}</span>

                  {/* Active checkmark */}
                  {isActive && (
                    <Check className="w-4 h-4 text-[#0066FF] shrink-0" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Footer note */}
          <div className="px-4 py-2.5 border-t border-[color:var(--x-border)] bg-[var(--x-bg)]">
            <p className="text-xs text-[color:var(--x-dim2)]">
              All values convert from USD base rates
            </p>
          </div>
        </div>
      )}
    </div>
  )
}


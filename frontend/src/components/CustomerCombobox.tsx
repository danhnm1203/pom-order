import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getPrimaryContact } from '@/lib/utils'
import type { Customer } from '@/types/api'

interface CustomerComboboxProps {
  customers: Customer[]
  value: string // empty string = no customer selected
  onChange: (customerId: string) => void
  disabled?: boolean
}

/**
 * Autocomplete picker — type to filter by name OR any contact value.
 *
 * UX behavior:
 *  - Empty input + focus = show all customers
 *  - Type to filter (case-insensitive substring on name AND on every contact value)
 *  - Click outside / Escape = close
 *  - Click row = select + close
 *  - When a customer is selected, input shows their name; click input or × to clear
 */
export function CustomerCombobox({
  customers,
  value,
  onChange,
  disabled = false,
}: CustomerComboboxProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = customers.find((c) => c.id === value) ?? null

  // Filter: name contains query OR any contact.value contains query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true
      return c.contacts.some((ct) => ct.value.toLowerCase().includes(q))
    })
  }, [customers, query])

  // Display: when input not focused AND user has a customer selected AND not typing,
  // show the customer's name as the visible value. Otherwise show the typed query.
  const displayValue = open || query ? query : (selected?.name ?? '')

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIdx(0)
  }, [filtered.length, open])

  function select(customerId: string) {
    onChange(customerId)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
      inputRef.current?.blur()
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = filtered[highlightIdx]
      if (pick) select(pick.id)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        disabled={disabled}
        value={displayValue}
        placeholder={t('customer.combobox_placeholder')}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="w-full px-3 py-2 pr-8 border border-border rounded-md text-sm bg-surface focus:outline-none focus:border-accent disabled:opacity-50"
      />

      {/* Clear button (only when a customer is selected and not actively typing) */}
      {selected && !query && !disabled && (
        <button
          type="button"
          onClick={() => {
            onChange('')
            setQuery('')
            setOpen(false)
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg w-5 h-5 flex items-center justify-center"
          aria-label={t('common.cancel')}
        >
          ×
        </button>
      )}

      {open && !disabled && (
        <ul
          className="absolute left-0 right-0 top-full mt-1 z-20 bg-surface border border-border rounded-md shadow-lg max-h-72 overflow-y-auto py-1"
          role="listbox"
        >
          {/* "Don't pick" option */}
          <li
            role="option"
            aria-selected={value === ''}
            onMouseDown={(e) => {
              e.preventDefault()
              select('')
            }}
            className={`px-3 py-2 text-sm cursor-pointer text-fg-subtle italic ${
              value === '' ? 'bg-surface-2' : 'hover:bg-surface-2'
            }`}
          >
            {t('order.customer_pick')}
          </li>

          {filtered.length === 0 ? (
            <li className="px-3 py-3 text-sm text-fg-subtle text-center">
              {t('customer.no_search_results')}
            </li>
          ) : (
            filtered.map((c, idx) => {
              const contact = getPrimaryContact(c)
              const isHighlighted = idx === highlightIdx
              const isSelected = c.id === value
              return (
                <li
                  key={c.id}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    // Use mouseDown not click to fire before blur
                    e.preventDefault()
                    select(c.id)
                  }}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  className={`px-3 py-2 text-sm cursor-pointer ${
                    isHighlighted ? 'bg-surface-2' : ''
                  } ${isSelected ? 'font-semibold' : ''}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={isSelected ? 'text-fg' : 'text-fg'}>{c.name}</span>
                    {contact && (
                      <span className="text-xs text-fg-subtle tabular">
                        {contact.channel !== 'phone' && (
                          <span className="uppercase">{contact.channel}: </span>
                        )}
                        {contact.value}
                      </span>
                    )}
                  </div>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}

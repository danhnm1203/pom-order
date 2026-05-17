import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Product } from '@/types/api'

interface ProductComboboxProps {
  products: Product[]
  value: string // product_id, '' = no product picked
  onChange: (productId: string, product: Product | null) => void
  onCreateNew?: (seedName: string) => void
  disabled?: boolean
}

/**
 * Search-by-typing product picker. Filters by name OR Korean name OR brand.
 * If `onCreateNew` is provided, the menu shows a "+ Create new" option when
 * the query doesn't match an existing product.
 */
export function ProductCombobox({
  products,
  value,
  onChange,
  onCreateNew,
  disabled = false,
}: ProductComboboxProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = products.find((p) => p.id === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true
      if (p.name_kr && p.name_kr.toLowerCase().includes(q)) return true
      if (p.brand_name && p.brand_name.toLowerCase().includes(q)) return true
      return false
    })
  }, [products, query])

  const displayValue = open || query ? query : (selected?.name ?? '')

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

  useEffect(() => {
    setHighlightIdx(0)
  }, [filtered.length, open])

  function select(productId: string, product: Product | null) {
    onChange(productId, product)
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
      if (pick) select(pick.id, pick)
    }
  }

  const showCreate = onCreateNew && query.trim().length > 0 && filtered.length === 0

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        disabled={disabled}
        value={displayValue}
        placeholder={t('product.combobox_placeholder')}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="w-full px-2 py-1.5 pr-7 border border-border rounded-md text-sm bg-surface focus:outline-none focus:border-accent disabled:opacity-50"
      />

      {selected && !query && !disabled && (
        <button
          type="button"
          onClick={() => {
            onChange('', null)
            setQuery('')
            setOpen(false)
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg w-5 h-5 flex items-center justify-center"
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
          <li
            role="option"
            aria-selected={value === ''}
            onMouseDown={(e) => {
              e.preventDefault()
              select('', null)
            }}
            className={`px-3 py-2 text-sm cursor-pointer text-fg-subtle italic ${
              value === '' ? 'bg-surface-2' : 'hover:bg-surface-2'
            }`}
          >
            {t('product.no_pick')}
          </li>

          {filtered.length === 0 && !showCreate && (
            <li className="px-3 py-3 text-sm text-fg-subtle text-center">
              {t('product.no_search_results')}
            </li>
          )}

          {filtered.map((p, idx) => {
            const isHighlighted = idx === highlightIdx
            const isSelected = p.id === value
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={isSelected}
                onMouseDown={(e) => {
                  e.preventDefault()
                  select(p.id, p)
                }}
                onMouseEnter={() => setHighlightIdx(idx)}
                className={`px-3 py-2 text-sm cursor-pointer ${
                  isHighlighted ? 'bg-surface-2' : ''
                } ${isSelected ? 'font-semibold' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span>{p.name}</span>
                  {p.brand_name && (
                    <span className="text-xs text-fg-subtle">{p.brand_name}</span>
                  )}
                </div>
                {p.name_kr && (
                  <div className="text-xs text-fg-subtle">{p.name_kr}</div>
                )}
              </li>
            )
          })}

          {showCreate && onCreateNew && (
            <li
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault()
                onCreateNew(query.trim())
                setOpen(false)
                setQuery('')
              }}
              className="px-3 py-2 text-sm cursor-pointer text-accent border-t border-border hover:bg-surface-2"
            >
              + {t('product.create_new_with_name', { name: query.trim() })}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

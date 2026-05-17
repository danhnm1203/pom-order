import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/StatusBadge'
import { apiClient, ApiException } from '@/lib/api-client'
import { type Order, type OrderStatus, type ProblemReason } from '@/types/api'

/** All statuses in lifecycle order — see OrderDetailPage for rationale. */
const ALL_STATUSES: OrderStatus[] = [
  'pending',
  'ordered',
  'in_transit',
  'arrived',
  'delivered',
  'completed',
  'problem',
  'cancelled',
]

const PROBLEM_REASON_KEYS: ProblemReason[] = [
  'out_of_stock',
  'wrong_variant',
  'ship_delay',
  'customer_cancel',
  'damaged',
  'customs_hold',
  'other',
]

interface QuickStatusMenuProps {
  order: Order
  onUpdate: (updated: Order) => void
}

/**
 * Click the status badge → popover with allowed transitions.
 * If target is 'problem', prompt for reason (same as detail page).
 */
export function QuickStatusMenu({ order, onUpdate }: QuickStatusMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const nextOptions = ALL_STATUSES.filter((s) => s !== order.status)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function transition(newStatus: OrderStatus) {
    let body: { status: OrderStatus; problem_reason?: string } = { status: newStatus }

    if (newStatus === 'problem') {
      const reasonOptions = PROBLEM_REASON_KEYS.map(
        (k, i) => `${i + 1}. ${t(`problem_reason.${k}`)} (${k})`,
      ).join('\n')
      const choice = window.prompt(
        `${t('problem_reason.prompt_title')} ${t('problem_reason.prompt_help')}:\n\n${reasonOptions}`,
      )
      if (!choice || !choice.trim()) {
        setOpen(false)
        return
      }
      const num = parseInt(choice.trim(), 10)
      const selected =
        !isNaN(num) && num >= 1 && num <= PROBLEM_REASON_KEYS.length
          ? PROBLEM_REASON_KEYS[num - 1]
          : choice.trim()
      body.problem_reason = selected
    }

    setSubmitting(true)
    try {
      const updated = await apiClient.patch<Order>(
        `/api/v1/orders/${order.id}/status`,
        body,
      )
      onUpdate(updated)
      setOpen(false)
    } catch (err) {
      alert(err instanceof ApiException ? err.message : t('order.status_change_error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (nextOptions.length > 0) setOpen((o) => !o)
        }}
        disabled={nextOptions.length === 0 || submitting}
        className={
          nextOptions.length > 0
            ? 'cursor-pointer hover:opacity-80 transition-opacity'
            : 'cursor-default'
        }
        title={nextOptions.length > 0 ? t('order.quick_status_label') : undefined}
      >
        <StatusBadge status={order.status} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-surface border border-border rounded-md shadow-lg min-w-44 py-1">
          <p className="text-xs text-fg-subtle uppercase tracking-wide px-3 py-1 border-b border-border">
            {t('order.quick_status_label')}
          </p>
          {nextOptions.map((next) => (
            <button
              key={next}
              type="button"
              onClick={() => transition(next)}
              disabled={submitting}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 transition-colors disabled:opacity-50"
            >
              → {t(`status.${next}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn/ui standard helper for merging Tailwind classes. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Format VND amount with thousands separator (Vietnamese convention: 1.234.567 ₫). */
export function formatVnd(amount: number | string | bigint): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : Number(amount)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(n)
}

/** Format KRW amount (Korean convention: 1,234,567 ₩ or with KRW). */
export function formatKrw(amount: number | string): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(n)
}

interface ContactLike {
  channel: string
  value: string
  is_primary: boolean
}

/**
 * Get the customer's "phone number" for display.
 * Falls back gracefully: phone → primary contact → first contact → '—'.
 *
 * Returns a tuple `[label, value]` so the caller can render channel label
 * separately (useful when fallback is Zalo/Facebook, not actual phone).
 */
export function getPrimaryContact(
  contacts: ContactLike[] | null | undefined,
): { channel: string; value: string } | null {
  if (!contacts || contacts.length === 0) return null
  const phone = contacts.find((c) => c.channel === 'phone')
  if (phone) return { channel: phone.channel, value: phone.value }
  const primary = contacts.find((c) => c.is_primary)
  if (primary) return { channel: primary.channel, value: primary.value }
  const first = contacts[0]
  return first ? { channel: first.channel, value: first.value } : null
}

/** Trigger a browser download of `content` as a file named `filename`. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Escape a CSV cell — wrap in quotes if it contains comma, newline, or quote. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('\n') || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Build a CSV row from values, properly escaped. */
export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',')
}

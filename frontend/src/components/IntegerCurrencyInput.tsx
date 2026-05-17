import type { InputHTMLAttributes } from 'react'

/**
 * Integer currency input that tolerates Vietnamese number formatting.
 *
 * Problem solved: `<input type="number">` parses "23.500" as 23.5 (dot = decimal
 * in the English locale browsers default to), so users typing Vietnamese-style
 * thousand separators silently lose 3 orders of magnitude. The bug only
 * surfaces later in the cost/profit math.
 *
 * This input:
 *   - state `value` always holds plain digits, no separators ("23500")
 *   - on every keystroke, strips everything that isn't 0-9 from the raw input
 *   - displays the parsed digits formatted with vi-VN thousand separators
 *     ("23.500"), so the user sees the value they expect
 *   - accepts paste of any format ("23,500", "23.500", "23 500") → all → "23500"
 *
 * Cursor position note: editing in the middle of a formatted number jumps the
 * cursor to the end. Acceptable trade-off for the simpler implementation;
 * appending at the end (the common case) works as expected.
 */
type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  value: string
  onChange: (digits: string) => void
}

export function IntegerCurrencyInput({ value, onChange, ...rest }: Props) {
  const digits = value.replace(/\D/g, '')
  const display = digits ? new Intl.NumberFormat('vi-VN').format(Number(digits)) : ''

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={display}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
    />
  )
}

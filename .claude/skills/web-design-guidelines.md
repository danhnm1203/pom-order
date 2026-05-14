# Web Interface Guidelines

Review UI code for compliance with web interface best practices. Audits code for 100+ rules covering accessibility, performance, and UX.

## Overview

This skill reviews UI code against Vercel's Web Interface Guidelines, providing concise, actionable feedback on accessibility, performance, typography, animations, forms, and more.

---

## Rules

### Accessibility

- **Icon-only buttons need `aria-label`** - Screen readers need text alternatives for icon buttons
- **Form controls need `<label>` or `aria-label`** - Every input must be labeled for assistive technology
- **Interactive elements need keyboard handlers** - Add `onKeyDown`/`onKeyUp` for keyboard accessibility
- **Use correct semantic elements** - `<button>` for actions, `<a>`/`<Link>` for navigation (not `<div onClick>`)
- **Images need `alt`** - Provide descriptive text, or `alt=""` if decorative
- **Decorative icons need `aria-hidden="true"`** - Hide purely visual icons from screen readers
- **Async updates need `aria-live="polite"`** - Toasts, validation messages need live region announcements
- **Use semantic HTML first** - `<button>`, `<a>`, `<label>`, `<table>` before ARIA attributes
- **Headings must be hierarchical** - Use `<h1>`–`<h6>` in order; include skip link for main content
- **Heading anchors need `scroll-margin-top`** - Prevent content hiding behind fixed headers

**Example - Icon Button:**
```tsx
// Bad
<button><IconTrash /></button>

// Good
<button aria-label="Delete item"><IconTrash aria-hidden="true" /></button>
```

**Example - Form Label:**
```tsx
// Bad
<input type="email" placeholder="Email" />

// Good
<label htmlFor="email">Email</label>
<input id="email" type="email" />
```

---

### Focus States

- **Interactive elements need visible focus** - Use `focus-visible:ring-*` or equivalent
- **Never remove outline without replacement** - Don't use `outline-none` / `outline: none` without alternative
- **Use `:focus-visible` over `:focus`** - Avoid focus ring on mouse click, show only for keyboard
- **Group focus with `:focus-within`** - Apply focus styles to parent for compound controls

**Example:**
```tsx
// Bad
<button className="outline-none">Click me</button>

// Good
<button className="focus-visible:ring-2 focus-visible:ring-blue-500">
  Click me
</button>
```

---

### Forms

- **Inputs need `autocomplete` and meaningful `name`** - Help browsers/password managers auto-fill correctly
- **Use correct input `type` and `inputmode`** - `email`, `tel`, `url`, `number` for proper mobile keyboards
- **Never block paste** - Don't use `onPaste` + `preventDefault`
- **Labels must be clickable** - Use `htmlFor` or wrap control in `<label>`
- **Disable spellcheck on specific fields** - Use `spellCheck={false}` on emails, codes, usernames
- **Checkboxes/radios: no dead zones** - Label + control share single hit target
- **Submit button stays enabled** - Disable only when request starts; show spinner during request
- **Errors inline next to fields** - Focus first error on submit
- **Placeholders end with `…`** - Show example pattern: `"example@company.com…"`
- **Use `autocomplete="off"` carefully** - Prevent password manager triggers on non-auth fields
- **Warn before navigation with unsaved changes** - Use `beforeunload` or router guard

**Example - Input with Autocomplete:**
```tsx
// Bad
<input type="text" name="email" />

// Good
<input
  type="email"
  name="email"
  autoComplete="email"
  spellCheck={false}
  inputMode="email"
/>
```

**Example - Submit Button:**
```tsx
// Bad
<button disabled={isSubmitting || !isValid}>Submit</button>

// Good
<button disabled={isSubmitting}>
  {isSubmitting ? 'Saving…' : 'Save Changes'}
</button>
```

---

### Animation

- **Honor `prefers-reduced-motion`** - Provide reduced variant or disable animations
- **Animate `transform`/`opacity` only** - Use compositor-friendly properties
- **Never `transition: all`** - List properties explicitly for performance
- **Set correct `transform-origin`** - Specify origin for rotation/scale animations
- **SVG transforms on wrapper** - Apply to `<g>` with `transform-box: fill-box; transform-origin: center`
- **Animations must be interruptible** - Respond to user input mid-animation

**Example - Reduced Motion:**
```tsx
// Bad
<div className="transition-all duration-500 ease-in-out" />

// Good
<div className="transition-[transform,opacity] duration-500 motion-reduce:transition-none" />
```

**Example - SVG Animation:**
```tsx
// Bad
<svg>
  <rect style={{ transform: 'rotate(45deg)' }} />
</svg>

// Good
<svg>
  <g style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
    <rect style={{ transform: 'rotate(45deg)' }} />
  </g>
</svg>
```

---

### Typography

- **Use `…` not `...`** - Proper ellipsis character
- **Use curly quotes** - `"` `"` not straight `"`
- **Non-breaking spaces for units** - `10&nbsp;MB`, `⌘&nbsp;K`, brand names
- **Loading states end with `…`** - `"Loading…"`, `"Saving…"`
- **Tabular numbers for columns** - Use `font-variant-numeric: tabular-nums` for number comparisons
- **Text wrapping for headings** - Use `text-wrap: balance` or `text-pretty` to prevent widows

**Example:**
```tsx
// Bad
<button disabled={loading}>
  {loading ? 'Loading...' : 'Load More'}
</button>

// Good
<button disabled={loading}>
  {loading ? 'Loading…' : 'Load More'}
</button>
```

---

### Content Handling

- **Text containers handle long content** - Use `truncate`, `line-clamp-*`, or `break-words`
- **Flex children need `min-w-0`** - Allow text truncation in flex containers
- **Handle empty states** - Don't render broken UI for empty strings/arrays
- **Anticipate content variations** - Test short, average, and very long user-generated content

**Example - Text Truncation:**
```tsx
// Bad
<div className="flex">
  <span>{longText}</span>
</div>

// Good
<div className="flex">
  <span className="min-w-0 truncate">{longText}</span>
</div>
```

---

### Images

- **Explicit `width` and `height`** - Prevents Cumulative Layout Shift (CLS)
- **Below-fold images: lazy load** - Use `loading="lazy"`
- **Above-fold critical images: prioritize** - Use `priority` or `fetchpriority="high"`

**Example:**
```tsx
// Bad
<img src="/hero.jpg" alt="Hero image" />

// Good - Next.js
<Image
  src="/hero.jpg"
  alt="Hero image"
  width={1200}
  height={630}
  priority
/>

// Good - HTML
<img
  src="/hero.jpg"
  alt="Hero image"
  width="1200"
  height="630"
  fetchpriority="high"
/>
```

---

### Performance

- **Virtualize large lists** - Use `virtua` or `content-visibility: auto` for >50 items
- **No layout reads in render** - Avoid `getBoundingClientRect`, `offsetHeight`, `offsetWidth`, `scrollTop`
- **Batch DOM reads/writes** - Don't interleave reads and writes
- **Prefer uncontrolled inputs** - Controlled inputs must be cheap per keystroke
- **Preconnect to CDN/asset domains** - Add `<link rel="preconnect">`
- **Preload critical fonts** - Use `<link rel="preload" as="font">` with `font-display: swap`

**Example - List Virtualization:**
```tsx
// Bad - Renders all 1000 items
<div>
  {items.map(item => <Item key={item.id} {...item} />)}
</div>

// Good - Virtual scrolling
import { VirtualScroller } from 'virtua';

<VirtualScroller>
  {items.map(item => <Item key={item.id} {...item} />)}
</VirtualScroller>
```

---

### Navigation & State

- **URL reflects state** - Put filters, tabs, pagination, expanded panels in query params
- **Links use `<a>`/`<Link>`** - Enable Cmd/Ctrl+click, middle-click support
- **Deep-link all stateful UI** - If component uses `useState`, consider URL sync via `nuqs` or similar
- **Destructive actions need confirmation** - Modal or undo window—never immediate deletion

**Example - URL State:**
```tsx
// Bad
const [tab, setTab] = useState('overview');

// Good - Using nuqs
import { useQueryState } from 'nuqs';

const [tab, setTab] = useQueryState('tab', { defaultValue: 'overview' });
```

---

### Touch & Interaction

- **Use `touch-action: manipulation`** - Prevents double-tap zoom delay on mobile
- **Set `-webkit-tap-highlight-color` intentionally** - Control tap highlight appearance
- **Use `overscroll-behavior: contain`** - Prevent scroll chaining in modals/drawers/sheets
- **Disable text selection during drag** - Apply `inert` on dragged elements
- **Use `autoFocus` sparingly** - Desktop only, single primary input; avoid on mobile

**Example - Modal Scroll:**
```tsx
<div className="overscroll-contain">
  <Modal>...</Modal>
</div>
```

---

### Safe Areas & Layout

- **Full-bleed layouts need safe area insets** - Use `env(safe-area-inset-*)` for notches
- **Avoid unwanted scrollbars** - Use `overflow-x-hidden` on containers, fix content overflow
- **Flex/grid over JS measurement** - Use CSS layout instead of measuring with JavaScript

**Example - Safe Areas:**
```css
.header {
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
}
```

---

### Dark Mode & Theming

- **Set `color-scheme: dark` on `<html>`** - Fixes scrollbar, inputs in dark mode
- **Match `theme-color` meta tag** - Use `<meta name="theme-color">` matching page background
- **Explicit colors on native `<select>`** - Set `background-color` and `color` for Windows dark mode

**Example:**
```tsx
// In layout or _document
<html className="dark" style={{ colorScheme: 'dark' }}>
  <head>
    <meta name="theme-color" content="#000000" />
  </head>
  {children}
</html>
```

---

### Locale & i18n

- **Use `Intl.DateTimeFormat`** - Don't hardcode date formats
- **Use `Intl.NumberFormat`** - Don't hardcode number/currency formats
- **Detect language via `Accept-Language`** - Use `navigator.languages`, not IP geolocation

**Example:**
```tsx
// Bad
const formatted = `$${price.toFixed(2)}`;

// Good
const formatted = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
}).format(price);
```

---

### Hydration Safety

- **Inputs with `value` need `onChange`** - Or use `defaultValue` for uncontrolled
- **Guard date/time rendering** - Prevent hydration mismatch between server and client
- **Use `suppressHydrationWarning` sparingly** - Only where truly needed

**Example - Date Rendering:**
```tsx
// Bad - Hydration mismatch
<time>{new Date().toLocaleString()}</time>

// Good - Client-only rendering
'use client';

export function ClientTime() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <time>Loading…</time>;

  return <time>{new Date().toLocaleString()}</time>;
}
```

---

### Hover & Interactive States

- **Buttons/links need `hover:` state** - Provide visual feedback
- **Interactive states increase contrast** - Hover/active/focus more prominent than rest state

**Example:**
```tsx
<button className="bg-gray-200 hover:bg-gray-300 active:bg-gray-400 focus-visible:ring-2">
  Click me
</button>
```

---

### Content & Copy

- **Use active voice** - "Install the CLI" not "The CLI will be installed"
- **Title Case for headings/buttons** - Follow Chicago style
- **Numerals for counts** - "8 deployments" not "eight"
- **Specific button labels** - "Save API Key" not "Continue"
- **Error messages include fix** - Show next step, not just problem
- **Use second person** - Avoid first person
- **Use `&` over "and"** - Where space-constrained

**Example:**
```tsx
// Bad
<button>Continue</button>
<p>The file has been uploaded</p>

// Good
<button>Save Changes</button>
<p>Upload your file</p>
```

---

## Anti-patterns (Flag These)

The following patterns should always be flagged in code reviews:

- ❌ `user-scalable=no` or `maximum-scale=1` disabling zoom
- ❌ `onPaste` with `preventDefault`
- ❌ `transition: all`
- ❌ `outline-none` without focus-visible replacement
- ❌ Inline `onClick` navigation without `<a>`
- ❌ `<div>` or `<span>` with click handlers (should be `<button>`)
- ❌ Images without dimensions
- ❌ Large arrays `.map()` without virtualization
- ❌ Form inputs without labels
- ❌ Icon buttons without `aria-label`
- ❌ Hardcoded date/number formats (use `Intl.*`)
- ❌ `autoFocus` without clear justification

---

## Output Format

When reviewing code, group findings by file. Use `file:line` format (VS Code clickable). Be terse.

**Example Output:**
```text
## src/Button.tsx

src/Button.tsx:42 - icon button missing aria-label
src/Button.tsx:18 - input lacks label
src/Button.tsx:55 - animation missing prefers-reduced-motion
src/Button.tsx:67 - transition: all → list properties

## src/Modal.tsx

src/Modal.tsx:12 - missing overscroll-behavior: contain
src/Modal.tsx:34 - "..." → "…"

## src/Card.tsx

✓ pass
```

State issue + location. Skip explanation unless fix is non-obvious. No preamble.

---

## Usage

This skill is applied when reviewing UI code or components. It checks for:

1. **Accessibility** - ARIA, semantic HTML, keyboard support
2. **Performance** - Virtualization, lazy loading, efficient rendering
3. **UX** - Forms, navigation, error handling
4. **Visual Polish** - Typography, animations, responsive design
5. **Internationalization** - Locale-aware formatting

Apply these guidelines proactively during code reviews and when generating new UI components.

## Sources

- [Vercel Labs: Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)
- [Vercel Labs: Agent Skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines)

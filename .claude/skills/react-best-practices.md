# React Best Practices

React and Next.js performance optimization guidelines optimized for AI-assisted development.

## Overview

This skill provides 40+ performance optimization rules across 8 categories, prioritized from critical to incremental. Apply these patterns when reviewing or generating React/Next.js code.

---

## 1. Eliminating Waterfalls (CRITICAL)

### 1.1 Defer Await Until Needed
Move `await` operations into branches where they're actually used to avoid blocking unused code paths.

**Bad:**
```typescript
async function handler(req) {
  const data = await fetchData(); // Blocks even if not needed
  if (req.query.skipData) return { ok: true };
  return { data };
}
```

**Good:**
```typescript
async function handler(req) {
  if (req.query.skipData) return { ok: true };
  const data = await fetchData(); // Only await when needed
  return { data };
}
```

### 1.2 Dependency-Based Parallelization
Use `better-all` for operations with partial dependencies to maximize parallelism.

### 1.3 Prevent Waterfall Chains in API Routes
Start independent operations immediately in API routes, even if you don't await them yet.

**Bad:**
```typescript
export async function GET() {
  const user = await getUser();
  const posts = await getPosts(user.id);
  const settings = await getSettings(user.id);
  return { user, posts, settings };
}
```

**Good:**
```typescript
export async function GET() {
  const userPromise = getUser();
  const user = await userPromise;
  const [posts, settings] = await Promise.all([
    getPosts(user.id),
    getSettings(user.id)
  ]);
  return { user, posts, settings };
}
```

### 1.4 Promise.all() for Independent Operations
Execute async operations concurrently when they have no interdependencies.

**Bad:**
```typescript
const user = await fetchUser();
const products = await fetchProducts();
const settings = await fetchSettings();
```

**Good:**
```typescript
const [user, products, settings] = await Promise.all([
  fetchUser(),
  fetchProducts(),
  fetchSettings()
]);
```

### 1.5 Strategic Suspense Boundaries
Use Suspense boundaries to show wrapper UI faster while data loads in specific sections.

**Good:**
```tsx
export default function Page() {
  return (
    <div>
      <Header />
      <Suspense fallback={<Skeleton />}>
        <DataComponent />
      </Suspense>
    </div>
  );
}
```

---

## 2. Bundle Size Optimization (CRITICAL)

### 2.1 Avoid Barrel File Imports
Import directly from source files. Barrel files can have 10,000+ re-exports taking 200-800ms to import.

**Bad:**
```typescript
import { Button } from '@/components'; // Imports entire barrel
```

**Good:**
```typescript
import { Button } from '@/components/Button';
```

### 2.2 Conditional Module Loading
Load large data or modules only when a feature is activated.

**Bad:**
```typescript
import EMOJI_DATA from './emoji-data.json'; // Always loaded

function EmojiPicker({ enabled }) {
  if (!enabled) return null;
  return <Picker data={EMOJI_DATA} />;
}
```

**Good:**
```typescript
async function loadEmojiData() {
  return (await import('./emoji-data.json')).default;
}

function EmojiPicker({ enabled }) {
  if (!enabled) return null;
  const [data, setData] = useState(null);
  useEffect(() => {
    loadEmojiData().then(setData);
  }, []);
  return data ? <Picker data={data} /> : <Loading />;
}
```

### 2.3 Defer Non-Critical Third-Party Libraries
Load analytics, logging, and error tracking after hydration.

**Good:**
```typescript
'use client';
import { useEffect } from 'react';

export function Analytics() {
  useEffect(() => {
    import('@vercel/analytics').then(({ track }) => {
      track('page_view');
    });
  }, []);
  return null;
}
```

### 2.4 Dynamic Imports for Heavy Components
Use `next/dynamic` to lazy-load large components not needed on initial render.

**Bad:**
```typescript
import HeavyChart from './HeavyChart'; // Always in bundle
```

**Good:**
```typescript
import dynamic from 'next/dynamic';

const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <p>Loading chart...</p>
});
```

### 2.5 Preload Based on User Intent
Preload heavy bundles before they're needed through hover, focus, or feature flag triggers.

**Good:**
```typescript
function Navigation() {
  const preloadDashboard = () => {
    import('./Dashboard');
  };

  return (
    <Link
      href="/dashboard"
      onMouseEnter={preloadDashboard}
      onFocus={preloadDashboard}
    >
      Dashboard
    </Link>
  );
}
```

---

## 3. Server-Side Performance (HIGH)

### 3.1 Cross-Request LRU Caching
Use LRU caching for data shared across sequential requests.

**Good:**
```typescript
import { LRUCache } from 'lru-cache';

const cache = new LRUCache({ max: 100, ttl: 60000 });

export async function getUser(id: string) {
  const cached = cache.get(id);
  if (cached) return cached;

  const user = await db.user.findUnique({ where: { id } });
  cache.set(id, user);
  return user;
}
```

### 3.2 Minimize Serialization at RSC Boundaries
Only pass fields that client components actually use.

**Bad:**
```tsx
// Server Component
const user = await db.user.findUnique({ where: { id } });
return <ClientProfile user={user} />; // Serializes all fields
```

**Good:**
```tsx
// Server Component
const user = await db.user.findUnique({
  where: { id },
  select: { name: true, avatar: true } // Only needed fields
});
return <ClientProfile user={user} />;
```

### 3.3 Parallel Data Fetching with Component Composition
Restructure with composition to parallelize data fetching.

**Bad:**
```tsx
async function Page() {
  const user = await fetchUser();
  return (
    <div>
      <UserProfile user={user} />
      <Posts userId={user.id} /> {/* Waits for user */}
    </div>
  );
}
```

**Good:**
```tsx
async function Page() {
  return (
    <div>
      <UserProfile /> {/* Fetches independently */}
      <Posts /> {/* Fetches independently */}
    </div>
  );
}
```

### 3.4 Per-Request Deduplication with React.cache()
Use React.cache() for server-side request deduplication within a single request.

**Good:**
```typescript
import { cache } from 'react';

export const getUser = cache(async (id: string) => {
  return await db.user.findUnique({ where: { id } });
});
```

### 3.5 Use after() for Non-Blocking Operations
Schedule work with `after()` to execute after response is sent.

**Good:**
```typescript
import { after } from 'next/server';

export async function GET(request: Request) {
  const data = await fetchData();

  after(async () => {
    await logAnalytics(data);
  });

  return Response.json(data);
}
```

---

## 4. Client-Side Data Fetching (MEDIUM-HIGH)

### 4.1 Deduplicate Global Event Listeners
Use `useSWRSubscription()` to share global event listeners across component instances.

### 4.2 Use SWR for Automatic Deduplication
SWR enables request deduplication, caching, and revalidation automatically.

**Good:**
```typescript
import useSWR from 'swr';

function Profile() {
  const { data, error } = useSWR('/api/user', fetcher);
  if (error) return <div>Failed to load</div>;
  if (!data) return <div>Loading...</div>;
  return <div>Hello {data.name}!</div>;
}
```

---

## 5. Re-render Optimization (MEDIUM)

### 5.1 Defer State Reads to Usage Point
Don't subscribe to dynamic state if you only read it inside callbacks.

**Bad:**
```typescript
const theme = useTheme(); // Re-renders on every theme change

function handleClick() {
  console.log(theme.color);
}
```

**Good:**
```typescript
const getTheme = useThemeGetter(); // No re-render

function handleClick() {
  const theme = getTheme();
  console.log(theme.color);
}
```

### 5.2 Extract to Memoized Components
Extract expensive work into memoized components.

**Bad:**
```typescript
function Parent({ items }) {
  return (
    <div>
      {items.map(item => (
        <ExpensiveChild key={item.id} data={item} />
      ))}
    </div>
  );
}
```

**Good:**
```typescript
const MemoizedChild = memo(ExpensiveChild);

function Parent({ items }) {
  return (
    <div>
      {items.map(item => (
        <MemoizedChild key={item.id} data={item} />
      ))}
    </div>
  );
}
```

### 5.3 Narrow Effect Dependencies
Specify primitive dependencies instead of objects.

**Bad:**
```typescript
useEffect(() => {
  fetchData(user);
}, [user]); // Re-runs when any user property changes
```

**Good:**
```typescript
useEffect(() => {
  fetchData(user.id);
}, [user.id]); // Only re-runs when ID changes
```

### 5.4 Subscribe to Derived State
Subscribe to derived boolean state instead of continuous values. The key is that the **hook itself** must accept a selector — simply comparing the return value outside does nothing.

**Bad:**
```typescript
// Re-renders on every scroll pixel — both are identical behavior
const scrollY = useScrollY();
const shouldShow = scrollY > 100;

// This does NOT fix it — useScrollY() still fires on every scroll
const shouldShow = useScrollY() > 100;
```

**Good — implement `useScrollY` with a selector:**
```typescript
import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('scroll', callback);
  return () => window.removeEventListener('scroll', callback);
}

// Without selector: re-renders on every scroll pixel
export function useScrollY(): number {
  return useSyncExternalStore(subscribe, () => window.scrollY, () => 0);
}

// With selector: only re-renders when the derived value changes
export function useScrollYSelector<T>(selector: (y: number) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(window.scrollY),
    () => selector(0)
  );
}
```

**Usage:**
```typescript
// Re-renders only when crossing the 100px threshold (true ↔ false)
const shouldShow = useScrollYSelector(y => y > 100);

// Re-renders only when the active section changes, not on every pixel
const activeSection = useScrollYSelector(y => {
  if (y < 300) return 'hero';
  if (y < 700) return 'features';
  return 'footer';
});
```

### 5.5 Use Functional setState Updates
When updating state based on current value, use functional updates.

**Bad:**
```typescript
const [count, setCount] = useState(0);
setCount(count + 1); // Stale closure risk
```

**Good:**
```typescript
const [count, setCount] = useState(0);
setCount(prev => prev + 1);
```

### 5.6 Use Lazy State Initialization
Pass a function to `useState` for expensive initial values.

**Bad:**
```typescript
const [data] = useState(expensiveComputation()); // Runs every render
```

**Good:**
```typescript
const [data] = useState(() => expensiveComputation()); // Runs once
```

### 5.7 Use Transitions for Non-Urgent Updates
Mark slow, non-urgent state updates as transitions so React keeps the UI responsive. The key rule: **always maintain a separate state for the controlled input** — wrapping the input's own state in `startTransition` delays the typed character appearing, which breaks typing.

**Bad — delays the input itself:**
```typescript
function SearchInput() {
  const [query, setQuery] = useState('');

  const handleChange = (e) => {
    // Input value is deferred — characters visibly lag behind typing
    startTransition(() => {
      setQuery(e.target.value);
    });
  };

  return <input value={query} onChange={handleChange} />;
}
```

**Good — split immediate input state from deferred results:**
```typescript
import { useState, startTransition, useDeferredValue } from 'react';

function SearchInput() {
  const [inputValue, setInputValue] = useState('');
  const [query, setQuery] = useState('');

  const handleChange = (e) => {
    setInputValue(e.target.value); // Immediate: input stays responsive

    startTransition(() => {
      setQuery(e.target.value); // Deferred: expensive filtering/fetching
    });
  };

  return (
    <>
      <input value={inputValue} onChange={handleChange} />
      <SearchResults query={query} /> {/* Only re-renders when transition completes */}
    </>
  );
}
```

**Alternative — `useDeferredValue` for the same effect without splitting handlers:**
```typescript
function SearchInput() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query); // React defers this automatically

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <SearchResults query={deferredQuery} />
    </>
  );
}
```

Use `startTransition` when you control the trigger (e.g. button click, tab switch). Use `useDeferredValue` when you receive a value from a parent and can't change the update source.

---

## 6. Rendering Performance (MEDIUM)

### 6.1 Animate SVG Wrapper Instead of SVG Element
Wrap SVG in a div and animate the wrapper for hardware acceleration.

**Bad:**
```tsx
<svg style={{ transform: `translateX(${x}px)` }}>...</svg>
```

**Good:**
```tsx
<div style={{ transform: `translateX(${x}px)` }}>
  <svg>...</svg>
</div>
```

### 6.2 CSS content-visibility for Long Lists
Apply `content-visibility: auto` to defer off-screen rendering.

**Good:**
```css
.list-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 100px;
}
```

### 6.3 Hoist Static JSX Elements
Extract static JSX outside components.

**Bad:**
```typescript
function Component() {
  return (
    <div>
      <Header /> {/* Recreated every render */}
    </div>
  );
}
```

**Good:**
```typescript
const staticHeader = <Header />;

function Component() {
  return <div>{staticHeader}</div>;
}
```

### 6.4 Optimize SVG Precision
Reduce SVG coordinate precision with SVGO's `--precision` flag.

### 6.5 Prevent Hydration Mismatch Without Flickering
Use inline scripts that execute synchronously before React hydrates.

**Good:**
```tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              const theme = localStorage.getItem('theme') || 'light';
              document.documentElement.classList.add(theme);
            })();
          `
        }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### 6.6 Preserve State While Hiding with CSS Display
Use `display: none` instead of conditional unmounting when the component is expensive to remount (preserves state, keeps DOM alive).

**Bad — unmounts on hide, loses state and triggers remount cost:**
```tsx
function Tabs({ activeTab }) {
  return (
    <>
      {activeTab === 'home' && <HomeTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </>
  );
}
```

**Good — stays mounted, state preserved, no remount cost:**
```tsx
function Tabs({ activeTab }) {
  return (
    <>
      <div style={{ display: activeTab === 'home' ? 'contents' : 'none' }}>
        <HomeTab />
      </div>
      <div style={{ display: activeTab === 'settings' ? 'contents' : 'none' }}>
        <SettingsTab />
      </div>
    </>
  );
}
```

> Use `display: contents` so the wrapper div doesn't affect layout. Only apply this pattern when remounting is genuinely expensive (complex forms, canvas, video, heavy data grids) — for cheap components, normal conditional rendering is clearer.

### 6.7 Use Explicit Conditional Rendering
Use ternary operators instead of `&&` when conditions can be falsy values.

**Bad:**
```tsx
{items.length && <List items={items} />} {/* Shows 0 when empty */}
```

**Good:**
```tsx
{items.length > 0 ? <List items={items} /> : null}
```

---

## 7. JavaScript Performance (LOW-MEDIUM)

### 7.1 Batch DOM CSS Changes
Group multiple CSS changes via classes or `cssText`.

**Bad:**
```typescript
element.style.width = '100px';
element.style.height = '100px';
element.style.background = 'red';
```

**Good:**
```typescript
element.className = 'new-style'; // or
element.style.cssText = 'width: 100px; height: 100px; background: red;';
```

### 7.2 Build Index Maps for Repeated Lookups
Convert arrays to Maps for O(1) lookups.

**Bad:**
```typescript
users.find(u => u.id === targetId); // O(n)
```

**Good:**
```typescript
const userMap = new Map(users.map(u => [u.id, u]));
userMap.get(targetId); // O(1)
```

### 7.3 Cache Property Access in Loops
Cache object property lookups in hot paths.

**Bad:**
```typescript
for (let i = 0; i < array.length; i++) {
  // array.length evaluated every iteration
}
```

**Good:**
```typescript
const len = array.length;
for (let i = 0; i < len; i++) {
  // Cached
}
```

### 7.4 Cache Repeated Function Calls
Use module-level Maps to cache function results.

**Good:**
```typescript
const cache = new Map();

function expensiveFunction(input) {
  if (cache.has(input)) return cache.get(input);
  const result = /* expensive computation */;
  cache.set(input, result);
  return result;
}
```

### 7.5 Cache Storage API Calls
Cache `localStorage`, `sessionStorage`, and `document.cookie` reads in memory.

**Good:**
```typescript
let cachedTheme: string | null = null;

function getTheme() {
  if (cachedTheme !== null) return cachedTheme;
  cachedTheme = localStorage.getItem('theme');
  return cachedTheme;
}
```

### 7.6 Combine Multiple Array Iterations
Combine multiple `.filter()` or `.map()` calls into one loop.

**Bad:**
```typescript
const active = users.filter(u => u.active);
const names = active.map(u => u.name);
const upper = names.map(n => n.toUpperCase());
```

**Good:**
```typescript
const upper = users
  .filter(u => u.active)
  .map(u => u.name.toUpperCase());
```

### 7.7 Early Length Check for Array Comparisons
Check array lengths first.

**Good:**
```typescript
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}
```

### 7.8 Early Return from Functions
Return early when result is determined.

**Bad:**
```typescript
function process(data) {
  let result;
  if (data.valid) {
    // complex logic
    result = complexComputation(data);
  } else {
    result = null;
  }
  return result;
}
```

**Good:**
```typescript
function process(data) {
  if (!data.valid) return null;
  return complexComputation(data);
}
```

### 7.9 Hoist RegExp Creation
Don't create RegExp inside render.

**Bad:**
```typescript
function Component({ text }) {
  const matches = text.match(/pattern/g); // Recreated every render
}
```

**Good:**
```typescript
const PATTERN = /pattern/g;

function Component({ text }) {
  const matches = text.match(PATTERN);
}
```

### 7.10 Use Loop for Min/Max Instead of Sort
Finding smallest/largest elements requires O(n), not O(n log n).

**Bad:**
```typescript
const min = numbers.sort((a, b) => a - b)[0]; // O(n log n)
```

**Good:**
```typescript
const min = Math.min(...numbers); // O(n)
```

### 7.11 Use Set/Map for O(1) Lookups
Convert arrays to Set/Map for repeated membership checks.

**Bad:**
```typescript
const allowed = ['a', 'b', 'c'];
if (allowed.includes(value)) { } // O(n)
```

**Good:**
```typescript
const allowed = new Set(['a', 'b', 'c']);
if (allowed.has(value)) { } // O(1)
```

### 7.12 Use toSorted() Instead of sort()
Use `.toSorted()` to create new sorted arrays without mutating.

**Bad:**
```typescript
const sorted = [...items].sort(); // Extra copy
```

**Good:**
```typescript
const sorted = items.toSorted(); // Built-in immutable sort
```

---

## 8. Advanced Patterns (LOW)

### 8.1 Store Event Handlers in Refs
Store callbacks in refs when used in effects.

**Good:**
```typescript
const handlerRef = useRef(handler);
useEffect(() => { handlerRef.current = handler; });

useEffect(() => {
  const listener = () => handlerRef.current();
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
}, []); // Empty deps, no re-subscription
```

### 8.2 useLatest for Stable Callback Refs
Access latest values in callbacks without adding them to dependency arrays.

**Good:**
```typescript
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; });
  return ref;
}

function Component({ onChange }) {
  const onChangeRef = useLatest(onChange);

  useEffect(() => {
    const handler = () => onChangeRef.current();
    window.addEventListener('change', handler);
    return () => window.removeEventListener('change', handler);
  }, []); // No onChange in deps
}
```

---

## 9. Memoization Patterns (MEDIUM)

### 9.1 useMemo / useCallback Overuse

The most common React performance mistake is wrapping everything in `useMemo`/`useCallback`. These hooks have a cost (memory, cache invalidation) and are only worth it when the wrapped value is passed to a memoized child or used as an effect dependency.

**Bad — memoizing cheap operations:**
```typescript
// Wrapping a simple string concat — pointless overhead
const fullName = useMemo(() => `${first} ${last}`, [first, last]);

// Stabilizing a handler that's never passed to a memo'd child
const handleClick = useCallback(() => setCount(c => c + 1), []);
```

**Good — memoize only when there's a proven re-render problem:**
```typescript
// Worth it: expensive computation used in render
const sortedList = useMemo(
  () => largeArray.toSorted((a, b) => b.score - a.score),
  [largeArray]
);

// Worth it: handler passed to a memo'd child component
const handleSubmit = useCallback((data) => {
  onSave(data);
}, [onSave]);

const MemoizedForm = memo(Form);
return <MemoizedForm onSubmit={handleSubmit} />;
```

**Rule of thumb:** Profile first. If you can't measure the re-render problem, don't add the memo.

---

### 9.2 React.memo — When It Helps and When It Doesn't

`React.memo` prevents re-renders when props haven't changed via **shallow comparison**. It only helps when (a) the component is actually expensive to render, and (b) its props are stable across parent re-renders.

**When it does nothing — unstable props:**
```typescript
// Bad: new object literal created every render — memo is bypassed every time
const MemoizedCard = memo(Card);

function Parent() {
  return <MemoizedCard style={{ color: 'red' }} />; // {} !== {} on every render
}

// Bad: inline function — new reference every render
function Parent() {
  return <MemoizedCard onClick={() => doSomething()} />;
}
```

**Fix: stabilize props before passing:**
```typescript
// Stable object: defined outside component or memoized
const cardStyle = { color: 'red' };

// Stable function: useCallback (or let React Compiler handle it)
const handleClick = useCallback(() => doSomething(), []);

function Parent() {
  return <MemoizedCard style={cardStyle} onClick={handleClick} />;
}
```

**The `children` pitfall — `children` is always a new JSX element:**
```typescript
// Bad: memo is useless here — children prop is a new object every render
const MemoizedWrapper = memo(Wrapper);

function Parent() {
  return (
    <MemoizedWrapper>
      <ExpensiveChild /> {/* New JSX element every render → memo skipped */}
    </MemoizedWrapper>
  );
}

// Fix: if you need to stabilize children, lift them out or use a slot pattern
const child = <ExpensiveChild />;

function Parent() {
  return <MemoizedWrapper>{child}</MemoizedWrapper>;
}
```

**Custom comparator for deep equality (use sparingly):**
```typescript
const MemoizedList = memo(List, (prevProps, nextProps) => {
  // Return true = skip re-render, false = re-render
  return (
    prevProps.items.length === nextProps.items.length &&
    prevProps.items.every((item, i) => item.id === nextProps.items[i].id)
  );
});
```

> Only use a custom comparator when shallow comparison is too aggressive (causes unnecessary re-renders) AND you've profiled and confirmed it's worth the added complexity.

**Decision checklist before adding `memo()`:**
- [ ] Is the component measurably slow to render? (Profile first)
- [ ] Are all props stable references (primitives, memoized objects/functions)?
- [ ] Does the component re-render frequently due to parent state changes unrelated to it?

---

## Usage

This skill is automatically applied when you're working with React or Next.js code. The rules are prioritized by impact:

- **CRITICAL**: Eliminating waterfalls, bundle size optimization
- **HIGH**: Server-side performance
- **MEDIUM-HIGH**: Client-side data fetching
- **MEDIUM**: Re-render optimization, rendering performance, memoization patterns
- **LOW-MEDIUM**: JavaScript performance
- **LOW**: Advanced patterns

Focus on critical and high-priority optimizations first, then progressively apply medium and low-priority patterns as needed.

## Sources

- [Vercel: Introducing React Best Practices](https://vercel.com/blog/introducing-react-best-practices)
- [GitHub: vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)

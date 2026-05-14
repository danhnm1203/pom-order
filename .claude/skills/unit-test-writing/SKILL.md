---
name: unit-test-writing
description: Use when writing or fixing unit tests in this repo. Covers Vitest + React Testing Library patterns, vi.hoisted mock setup, SDK mocking, source-code inspection strategy, coverage analysis, and all project-specific pitfalls discovered in the checkin-host test suites.
---

# Unit Test Writing Guide

This skill captures every concrete pattern and pitfall for writing unit tests in this monorepo. Read before writing any new `__tests__/` file.

---

## Stack

| Tool                      | Version | Purpose             |
| ------------------------- | ------- | ------------------- |
| Vitest                    | 3.x     | Test runner         |
| @testing-library/react    | 16.x    | Component rendering |
| @testing-library/jest-dom | 6.x     | DOM matchers        |
| jsdom                     | 26.x    | Browser environment |
| @vitest/coverage-v8       | 3.x     | Coverage reports    |

```bash
pnpm --filter checkin-host run test:run       # Run once (CI)
pnpm --filter checkin-host run test:watch     # Watch mode
pnpm --filter checkin-host run test:coverage  # Coverage report
```

---

## File Organization

Tests live in `__tests__/` directories co-located next to the source they test:

```
src/
├── components/
│   ├── CheckinHostApp.tsx
│   └── __tests__/
│       └── CheckinHostApp.test.tsx
├── hooks/
│   ├── usePWA.ts
│   └── __tests__/
│       └── usePWA.test.ts
└── utils/
    ├── auth.ts
    └── __tests__/
        └── auth.test.ts
```

Naming: `<SourceFile>.test.ts` or `<SourceFile>.test.tsx` (when file contains JSX).

---

## Two Test Strategies

### Strategy 1: DOM Rendering Tests (React Testing Library)

For components and hooks that have **user-visible behaviour**.
Test what the user sees, not implementation details.

```typescript
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

it('shows facility name after data loads', async () => {
  render(<CheckinHostApp facilityId="f-1" configId="c-1" />)

  await waitFor(() => {
    expect(screen.getByText('Test Facility')).toBeInTheDocument()
  })
})
```

**Use when:** component renders visible output, has user interactions, async data loading, state changes.

---

### Strategy 2: Source Code Inspection Tests

For components that are **too complex to render in isolation** (deep network calls, multi-step flows, large dependency trees) but whose logic and structure still needs to be verified.

Read the source file as a string and assert on its content.

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

const readSource = () =>
  fs.readFileSync(path.resolve(__dirname, "../ReservationSearch.tsx"), "utf-8");

it("accepts matchingMode prop in interface", () => {
  const src = readSource();
  const propsStart = src.indexOf("interface ReservationSearchProps");
  const propsEnd = src.indexOf("}", propsStart);
  expect(src.substring(propsStart, propsEnd)).toContain("matchingMode");
});

it("sends get_matching_mode to reservation-lookup", () => {
  const src = readSource();
  const effectStart = src.indexOf("Fetch matching mode from DB");
  const effectEnd = src.indexOf(
    "}, [showReservationSearch, facilityId, configId])",
    effectStart,
  );
  expect(src.substring(effectStart, effectEnd)).toContain(
    "method: 'get_matching_mode'",
  );
});
```

**Use when:**

- Component renders complex multi-step UI (ReservationSearch, GuestFormStep)
- Component has deeply chained network calls that are hard to mock
- You want to verify props interface, state wiring, effect dependencies, or API call shapes
- You want to keep those files in the coverage denominator without full render overhead

**Pattern — scope assertions with substring:**

```typescript
// Extract a bounded block (interface, useEffect, function body) to avoid
// false positives from other parts of the file
const blockStart = src.indexOf("interface Foo {");
const blockEnd = src.indexOf("}", blockStart);
const block = src.substring(blockStart, blockEnd);
expect(block).toContain("myProp");
```

**Pattern — read multiple files:**

```typescript
const readGuestFormStep = () =>
  fs.readFileSync(
    path.resolve(__dirname, "../reservation-search/GuestFormStep.tsx"),
    "utf-8",
  );

const readBackend = () =>
  fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../../../supabase/functions/guest-form/index.ts",
    ),
    "utf-8",
  );
```

---

## Critical: Mock Hoisting with vi.hoisted()

`vi.mock()` calls are **hoisted to the top of the file** before any `const` declarations run. Referencing a `const` inside `vi.mock()` causes `ReferenceError: Cannot access 'x' before initialization`.

### ❌ Wrong — ReferenceError

```typescript
const mockService = { checkin: vi.fn() };

vi.mock("@keyvox-org/unlockos-sdk", () => ({
  CheckinServiceWithUI: vi.fn(() => mockService), // ReferenceError!
}));
```

### ✅ Correct — use vi.hoisted()

```typescript
const { mockService } = vi.hoisted(() => ({
  mockService: { checkin: vi.fn() },
}));

vi.mock("@keyvox-org/unlockos-sdk", () => ({
  CheckinServiceWithUI: vi.fn(() => mockService), // works
}));
```

Group all shared mock objects into **one** `vi.hoisted()` call:

```typescript
const {
  mockModalManager,
  mockCheckinService,
  mockSupabase,
  mockPersistenceHook,
  mockTokenManager,
} = vi.hoisted(() => {
  const mockModalManager = {
    showModal: vi.fn(),
    hideModal: vi.fn(),
    hideAllModals: vi.fn(),
  };
  const mockCheckinService = {
    checkin: vi.fn(),
    showError: vi.fn(),
    setModalManager: vi.fn(),
  };
  const mockSupabase = {
    from: vi.fn(),
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() },
  };
  const mockPersistenceHook = {
    isCheckedIn: false,
    checkInId: null as string | null,
    persistCheckIn: vi.fn().mockResolvedValue(undefined),
    clearCheckIn: vi.fn(),
    // ... all hook return fields
  };
  const mockTokenManager = { setFacilityId: vi.fn() };
  return {
    mockModalManager,
    mockCheckinService,
    mockSupabase,
    mockPersistenceHook,
    mockTokenManager,
  };
});
```

---

## Mocking @keyvox-org/unlockos-sdk

The SDK is a local workspace package resolved via path alias. Always mock it wholesale with `vi.mock`:

```typescript
vi.mock('@keyvox-org/unlockos-sdk', () => ({
  UnlockSDKUIProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUnlockSDKUI: vi.fn(() => ({ modalManager: mockModalManager })),
  CheckinServiceWithUI: vi.fn(() => mockCheckinService),
  useCheckinPersistence: vi.fn(() => ({ ...mockPersistenceHook })),
  updateModalCache: vi.fn(),
  CongestionDisplay: vi.fn(({ onDataChange }: any) => {
    React.useEffect(() => {
      if (onDataChange) onDataChange({ congestionRate: 100 })
    }, [])
    return <div data-testid="congestion-display" />
  }),
  supabase: mockSupabase,
  setSupabaseConfig: vi.fn(),
  sdkUIi18n: { language: 'ja', changeLanguage: vi.fn(), t: vi.fn((k: string) => k) },
  tokens: { color: { brand: { primary: '#488DE0' } }, typography: { fontFamily: { primary: 'sans-serif', mono: 'monospace' } } },
  LoadingButton: ({ children, onClick, disabled, isLoading }: any) => (
    <button onClick={onClick} disabled={disabled || isLoading} data-testid="checkin-button">
      {isLoading ? 'Loading...' : children}
    </button>
  ),
}))
```

---

## Mutable Hook State Pattern

For hooks that return stateful data, define a **mutable object** and spread it in the mock. Tests mutate properties before `render()`.

```typescript
// In vi.hoisted — define the object
const mockPersistenceHook = {
  isCheckedIn: false,
  checkInId: null as string | null,
  isRestoring: false,
  persistCheckIn: vi.fn().mockResolvedValue(undefined),
  clearCheckIn: vi.fn(),
}

// In vi.mock — spread into the hook return
vi.mock('@keyvox-org/unlockos-sdk', () => ({
  useCheckinPersistence: vi.fn(() => ({ ...mockPersistenceHook })),
}))

// In beforeEach — always reset to known state
beforeEach(() => {
  vi.clearAllMocks()
  mockPersistenceHook.isCheckedIn = false
  mockPersistenceHook.checkInId = null
  mockPersistenceHook.isRestoring = false
  mockPersistenceHook.persistCheckIn = vi.fn().mockResolvedValue(undefined)
  mockPersistenceHook.clearCheckIn = vi.fn()
})

// In test — configure state before render
it('shows checked-in UI', async () => {
  mockPersistenceHook.isCheckedIn = true
  mockPersistenceHook.checkInId = 'checkin-123'
  render(<CheckinHostApp {...props} />)
  expect(screen.getByText('✓')).toBeInTheDocument()
})
```

---

## Mocking Supabase Chained Queries

```typescript
// In beforeEach
mockSupabase.from.mockReturnValue({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi
        .fn()
        .mockResolvedValueOnce({ data: { name: "Test Facility" }, error: null })
        .mockResolvedValueOnce({
          data: { name: "Test Config", show_occupancy_on_checkin: true },
          error: null,
        }),
    }),
  }),
});
mockSupabase.auth.getSession.mockResolvedValue({
  data: { session: null },
  error: null,
});
mockSupabase.auth.onAuthStateChange.mockReturnValue({
  data: { subscription: { unsubscribe: vi.fn() } },
});
```

To override for a single test (e.g. error case):

```typescript
it('handles DB error gracefully', async () => {
  mockSupabase.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockRejectedValue(new Error('DB error')),
      }),
    }),
  })
  render(<CheckinHostApp {...props} />)
  await waitFor(() => expect(screen.queryByText('Test Facility')).not.toBeInTheDocument())
})
```

---

## Pitfall: Skipped Tests (describe.skip / it.skip)

When you see `describe.skip` or `it.skip`, **don't rewrite the tests — fix the mocks.**

Workflow:

1. Read the component to find all new imports since the skip was added
2. Add missing exports to the `vi.mock()` factory
3. Fix `vi.hoisted()` structure if needed
4. Remove the skip
5. Run tests and fix only the assertion mismatches (character changes, new elements)

**Common reasons tests get skipped:**

- New hook added to component (`useCheckinPersistence`, `updateModalCache`)
- New child component imported (`InstallPrompt`, `ReservationSearch`)
- New util imported (`recoveryHelpers`)
- Assertion references old UI text (e.g. `✅` → `✓`)

---

## Pitfall: Callbacks During Render → OOM

Mocked components that call prop-callbacks **synchronously during render** trigger parent `setState`, causing infinite re-renders and JavaScript heap OOM crash.

### ❌ Wrong

```typescript
CongestionDisplay: vi.fn(({ onDataChange }: any) => {
  if (onDataChange) onDataChange({ congestionRate: 45 })  // during render!
  return <div data-testid="congestion-display" />
})
```

### ✅ Correct — defer with useEffect

```typescript
CongestionDisplay: vi.fn(({ onDataChange }: any) => {
  React.useEffect(() => {
    if (onDataChange) onDataChange({ congestionRate: 45 })
  }, [])
  return <div data-testid="congestion-display" />
})
```

> `React` must be explicitly imported at the top of the test file — it is **not** auto-imported even with the Vite React plugin.

---

## Pitfall: Multiple Elements with Same Text

`getByText` throws when more than one element matches. Use `getAllByText` or a more specific query.

```typescript
// ❌ Throws if "Loading..." appears on button AND placeholder simultaneously
expect(screen.getByText("Loading...")).toBeInTheDocument();

// ✅ Safe
expect(screen.getAllByText("Loading...").length).toBeGreaterThan(0);

// ✅ Or target role specifically
expect(screen.getByRole("button", { name: /loading/i })).toBeDisabled();
```

---

## Pitfall: Asserting Before Async State Settles

Always `waitFor` after renders that trigger async operations (data fetch, auth, effects).

```typescript
// ❌ May fail if data hasn't loaded yet
render(<CheckinHostApp {...props} />)
expect(screen.getByText('Test Facility')).toBeInTheDocument()

// ✅ Wait for async state
render(<CheckinHostApp {...props} />)
await waitFor(() => {
  expect(screen.getByText('Test Facility')).toBeInTheDocument()
})
```

Wait for button to be enabled before clicking:

```typescript
await waitFor(() => {
  expect(screen.getByTestId("checkin-button")).not.toBeDisabled();
});
fireEvent.click(screen.getByTestId("checkin-button"));
```

---

## Pitfall: vi.clearAllMocks() vs vi.resetAllMocks()

| Method               | Effect                                                              |
| -------------------- | ------------------------------------------------------------------- |
| `vi.clearAllMocks()` | Clears call history, instances, results. Keeps mock implementation. |
| `vi.resetAllMocks()` | Clears everything + resets mock implementation to `undefined`.      |

**Pattern used in this project:**

- `beforeEach` → `vi.clearAllMocks()` + manually reset mutable state
- `afterEach` → `vi.resetAllMocks()` (full cleanup between tests)

---

## Hook Tests with renderHook

For testing custom hooks in isolation without rendering a component:

```typescript
import { renderHook, act } from "@testing-library/react";
import { usePWA } from "../usePWA";

it("returns isInstallable=true when beforeinstallprompt fires", () => {
  const { result } = renderHook(() => usePWA());

  act(() => {
    window.dispatchEvent(new Event("beforeinstallprompt"));
  });

  expect(result.current.isInstallable).toBe(true);
});
```

---

## Pure Function / Class Tests

For utils and services with no React — just instantiate and call:

```typescript
import { HostedAuth, createAuthFromURL } from "../auth";

it("creates instance with full config", () => {
  const auth = new HostedAuth({
    token: "test",
    facilityId: "f-1",
    configId: "c-1",
  });
  expect(auth.isAuthenticated()).toBe(true);
  expect(auth.getFacilityId()).toBe("f-1");
});

it("returns false when no token", () => {
  const auth = new HostedAuth({});
  expect(auth.isAuthenticated()).toBe(false);
});
```

---

## Coverage Analysis Workflow

1. Run: `pnpm --filter checkin-host run test:coverage`
2. Focus on **Stmts** and **Lines** columns — these are the enforced thresholds
3. Files with 0% fall into 3 categories:

| Category                  | Action                                    |
| ------------------------- | ----------------------------------------- |
| Entry point (`main.tsx`)  | Add to `coverage.exclude`                 |
| Has tests but all skipped | Find `describe.skip` → fix mocks → unskip |
| No tests at all           | Write new tests                           |

### Excluding Non-Testable Files

```typescript
// vitest.config.ts
coverage: {
  exclude: [
    "src/**/*.test.{ts,tsx}",
    "src/test/**",
    "src/vite-env.d.ts",
    "src/main.tsx", // ReactDOM.createRoot entry — structurally untestable
  ];
}
```

### Excluding Complex UI from Denominator

Large render-heavy form components that are better validated by E2E tests can be excluded:

```typescript
'src/components/ReservationSearch.tsx',        // 752 lines, multi-step form
'src/components/reservation-search/CodeOrNameStep.tsx',
'src/components/reservation-search/GuestFormStep.tsx',
```

> Use source-code inspection tests (Strategy 2) on these files instead of excluding entirely — you get coverage credit for their logic without the render overhead.

### Current Thresholds (checkin-host)

```
statements: 60%   branches: 60%   functions: 60%   lines: 60%
```

---

## Standard Test File Structure

```typescript
import React from 'react'                          // always explicit in test files
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// 1. Hoist all shared mock objects
const { mockFoo, mockBar } = vi.hoisted(() => ({
  mockFoo: { method: vi.fn() },
  mockBar: vi.fn(),
}))

// 2. Declare all vi.mock() calls (order doesn't matter, they're hoisted)
vi.mock('../Foo', () => ({ Foo: vi.fn(() => mockFoo) }))
vi.mock('../Bar', () => ({ default: mockBar }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { changeLanguage: vi.fn() } }),
}))

// 3. Test suite
describe('ComponentName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mutable mock state to known baseline
    mockFoo.method.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Feature Group', () => {
    it('should [behaviour] when [condition]', async () => {
      // Arrange — configure mocks for this test
      mockFoo.method.mockResolvedValue({ success: false })

      // Act
      render(<ComponentName />)
      await waitFor(() => expect(screen.getByTestId('result')).toBeInTheDocument())

      // Assert
      expect(screen.getByTestId('result')).toHaveTextContent('failed')
    })
  })
})
```

---

## Describe Block Organisation

Group tests by **feature area**, not by file section. This mirrors the plan used for `CheckinHostApp`:

```
describe('ComponentName')
  describe('Initialization & Props')       ← required props, theme, lang
  describe('Session Management')           ← login state, logout flow
  describe('Data Loading')                 ← fetch, loading state, errors
  describe('Core Flow')                    ← main user action (checkin, submit)
  describe('Integration with Service X')  ← service method calls, config
  describe('UI Rendering')                 ← conditional visibility, icons
```

---

## Pre-Commit Checklist

- [ ] No `describe.skip` or `it.skip` left behind
- [ ] All mock objects created via `vi.hoisted()` if used inside `vi.mock()`
- [ ] `React` explicitly imported in `.tsx` test files
- [ ] No callbacks called synchronously during render (use `useEffect`)
- [ ] `beforeEach` resets all mutable mock state fields
- [ ] All async assertions wrapped in `waitFor`
- [ ] Buttons waited to be enabled before `fireEvent.click`
- [ ] `pnpm --filter <app> run test:coverage` passes all thresholds

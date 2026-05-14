---
description: "Run tests, docs, help docs, and mobile optimization agents in parallel to finalize a feature"
---

# Finalize Feature

Feature implementation is done. Finalize by running 5 agents **in parallel**:

1. **tdd-guide** agent: Write tests for the feature, verify 80%+ coverage
2. **doc-updater** agent: Update codemaps and documentation
3. **help-docs-creator** agent: Create/update user-facing help documentation
4. **frontend-design** skill: Mobile view optimization and responsive polish
5. **insecure-defaults** skill: Scan for fail-open config patterns in changed files

## Instructions

Use the user's input `$ARGUMENTS` to identify the target feature and its key files.

Launch all 4 agents simultaneously using the Task tool with `run_in_background: true`.

### Agent 1: Tests & Coverage (tdd-guide)

- Identify all source files for the feature
- Write unit tests for lib/utility functions (happy path, edge cases, error handling)
- Write integration tests for API routes (auth, validation, response)
- Write component tests for UI (rendering, interactions, loading states)
- Target 80%+ coverage

### Agent 2: Documentation (doc-updater)

- Create or update codemap in `docs/CODEMAPS/`
- Update `docs/CODEMAPS/INDEX.md` with new entries
- Add cross-references to related codemaps
- Cover: architecture, data flow, API routes, DB schema, key modules
- Also optimize `docs/business/` documentation:
  - Update or create feature descriptions in `docs/business/`
  - Ensure business docs reflect current implementation (remove outdated info, add new sections)
  - Maintain consistency between technical codemaps and business-facing docs
  - Add diagrams or flow descriptions for non-technical stakeholders where relevant

### Agent 3: Help Documentation (help-docs-creator)

- Create or update help markdown in `packages/full-package/src/locales/{en,ja}/help/`
- Ensure manifest is updated via `pnpm run sync:help-docs`
- Cover: feature overview, step-by-step instructions, FAQ, troubleshooting

### Agent 4: Mobile View Optimization (frontend-design)

- Use the `frontend-design` skill to review and optimize for mobile
- Check responsive breakpoints (sm/md/lg) are properly set
- Verify touch targets are 44px+ for mobile usability
- Fix overflow, text truncation, and layout issues on small screens
- Ensure modals, drawers, and forms are mobile-friendly
- Test navigation and interactive elements for mobile UX
- Apply Tailwind responsive utilities where missing

### Agent 5: Insecure Defaults Check (insecure-defaults)

- Scan changed/new files for fail-open patterns
- Check env variable handling (`|| 'default'` vs crash-on-missing)
- Verify Edge Function config (JWT verification, CORS origins)
- Flag any hardcoded fallback secrets or permissive defaults

## Output

Report results from all 4 agents as they complete. Summarize:
- Test count and coverage percentage
- Files created/updated by each agent
- Mobile optimization changes applied
- Any issues found

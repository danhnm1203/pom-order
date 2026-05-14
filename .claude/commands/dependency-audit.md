---
description: "Audit supply chain risk of project dependencies using Trail of Bits supply-chain-risk-auditor"
---

# Dependency Audit

Audit the project's npm dependencies for supply chain risks. Use when adding new dependencies or before releases.

## Instructions

Use the `supply-chain-risk-auditor` skill to analyze dependencies.

### Steps

1. **Identify scope** from `$ARGUMENTS` (specific package or all dependencies)
2. **Run npm audit** as baseline: `pnpm audit --audit-level=moderate`
3. **Analyze with supply-chain-risk-auditor skill** for deeper risks:
   - Unmaintained packages (no commits in 12+ months)
   - Single-maintainer packages (bus factor = 1)
   - Typosquatting risk
   - Excessive permission scope
   - Known compromised maintainer accounts
4. **Cross-reference** with `sharp-edges` skill for risky API patterns in dependencies

## Output

```markdown
# Dependency Audit Report

**Date:** YYYY-MM-DD
**Packages Scanned:** X

## npm audit
[Standard vulnerability findings]

## Supply Chain Risks
| Package | Risk | Severity | Reason |
|---------|------|----------|--------|

## Recommendations
- [ ] Replace: [package] with [alternative]
- [ ] Pin: [package] to exact version
- [ ] Monitor: [package] for future issues
```

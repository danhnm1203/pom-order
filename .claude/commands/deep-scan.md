---
description: "Run deep security scan using Trail of Bits tools (static-analysis, insecure-defaults, differential-review) in parallel"
---

# Deep Security Scan

Run a comprehensive security scan using Trail of Bits skills. Use before releases or when reviewing security-sensitive changes.

## Instructions

Use the user's input `$ARGUMENTS` to determine scope (specific files, directories, or entire codebase).

Launch 3 security analysis skills **in parallel**:

### Skill 1: Static Analysis (static-analysis)

- Run Semgrep scan on the target scope
- Focus on high-confidence security vulnerabilities
- Use `--metrics=off` flag
- Output SARIF report

### Skill 2: Insecure Defaults (insecure-defaults)

- Scan for fail-open patterns in config files and env handling
- Check `.env*`, `config.toml`, `wrangler.toml`, `vite.config.*`
- Check Edge Functions for hardcoded fallback values
- Distinguish fail-open (CRITICAL) from fail-secure (SAFE)

### Skill 3: Differential Review (differential-review)

- If on a feature branch: analyze diff from develop branch
- If on develop: analyze recent commits
- Calculate blast radius of changes
- Flag security regressions (auth bypass, missing validation, exposed secrets)

## Output

Combine results from all 3 skills into a unified report:

```markdown
# Deep Security Scan Report

**Scope:** [target]
**Date:** YYYY-MM-DD

## Static Analysis Findings
[Semgrep results organized by severity]

## Insecure Default Findings
[Fail-open patterns found]

## Differential Review Findings
[Security regressions in recent changes]

## Action Items
- [ ] CRITICAL: [items requiring immediate fix]
- [ ] HIGH: [items to fix before merge]
- [ ] MEDIUM: [items to address when possible]
```

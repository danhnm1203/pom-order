---
description: Commit format, PR requirements, feature workflow, database migration review.
---

# Git Workflow

## Commit Message Format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Note: Attribution disabled globally via ~/.claude/settings.json.

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

## PR Description Requirements (for Blog Auto-Generation)

All PRs MUST include the following sections for automatic blog post generation:

### 1. Mandatory Sections

#### Why (なぜ)
- What user/operational/security problem does this solve?
- What pain point motivated this change?

#### Trade-offs (何を捨てた)
- Speed vs Safety
- Flexibility vs Complexity
- Performance vs Maintainability
- Other alternatives considered and rejected

#### Impact (何が良くなる)
- Reliability improvements
- Observability enhancements
- Compatibility changes
- Cost implications
- Performance characteristics

### 2. PR Template Structure

```markdown
## TL;DR
[One-sentence summary of the change]

## Background (現場で起きた問題)
[Real-world problem that triggered this PR]

## Changes (変更内容)
- Key change 1
- Key change 2
- Key change 3

## Why (なぜ)
[User/operational/security problem this solves]

## Trade-offs (何を捨てた)
- **Rejected approach A**: [Reason]
- **Rejected approach B**: [Reason]
- **Chosen approach**: [Why this won]

## Impact (何が良くなる)
- **Reliability**: [Changes]
- **Observability**: [Changes]
- **Compatibility**: [Breaking/Non-breaking]
- **Performance**: [Changes]
- **Cost**: [Implications]

## User Value (ユーザー価値)
[Translate technical changes into adoption reasons]

## Public Disclosure Check
- [ ] No sensitive credentials or internal URLs
- [ ] No customer-specific information
- [ ] No unreleased feature details (if confidential)
- [ ] Safe for public blog post
```

### 3. Theme Labels (採用理由のテーマラベル)

Tag PRs with one or more theme labels for blog post grouping:

#### Security (セキュリティ強化)
- `theme:security/key-management` - Key rotation, encryption, secrets management
- `theme:security/authorization` - Access control, permission models, RBAC
- `theme:security/audit` - Audit logs, compliance, traceability
- `theme:security/hardening` - Attack surface reduction, input validation

#### Reliability (信頼性)
- `theme:reliability/failsafe` - Graceful degradation, circuit breakers
- `theme:reliability/offline` - Offline-first behavior, sync strategies
- `theme:reliability/idempotency` - Idempotent operations, retry safety
- `theme:reliability/data-integrity` - Consistency, transactions, validation

#### Operations (運用)
- `theme:ops/monitoring` - Metrics, alerts, dashboards
- `theme:ops/slo` - SLO/SLA definitions, error budgets
- `theme:ops/debuggability` - Logging, tracing, debugging tools
- `theme:ops/automation` - CI/CD, deployment automation

#### Scale (スケール)
- `theme:scale/multi-tenant` - Tenant isolation, resource quotas
- `theme:scale/rate-limiting` - Rate limits, throttling, backpressure
- `theme:scale/performance` - Query optimization, caching, indexing
- `theme:scale/architecture` - Sharding, partitioning, horizontal scaling

#### Developer Experience (開発者体験)
- `theme:dx/api-design` - API ergonomics, type safety
- `theme:dx/documentation` - SDK docs, examples, guides
- `theme:dx/testing` - Test utilities, mocking, fixtures
- `theme:dx/tooling` - CLI tools, code generation, linting

### 4. Blog Post Generation Rules

#### Grouping PRs into Releases
- Group PRs by theme labels for cohesive blog posts
- One blog post per release OR one blog post per theme
- Example: "Security Enhancements in v2.1" (groups all `theme:security/*` PRs)

#### Auto-Generated Blog Structure
```markdown
# [Theme] in [Release/Sprint]

## TL;DR
[Aggregate summary of all PRs in this theme]

## Background
[Common pain points across PRs]

## What Changed
[Consolidated list of changes]

## Why It Matters
[User value proposition]

## Technical Details
[For each PR]:
- **[PR Title]**: [Summary]
  - Why: [Reason]
  - Trade-off: [Decision]
  - Impact: [Result]

## Migration Guide (if breaking changes)
[Step-by-step migration instructions]

## Adoption Reasons
- [Reason 1 from theme]
- [Reason 2 from theme]
- [Reason 3 from theme]
```

### 5. PR Review Checklist

Before merging, verify:
- [ ] All mandatory sections (Why, Trade-offs, Impact) filled
- [ ] At least one theme label applied
- [ ] Public disclosure check completed
- [ ] User value clearly articulated
- [ ] Technical accuracy verified

### 6. Database Migration Review (CRITICAL)

SQLマイグレーションファイルを含むPRでは必ず確認:
- [ ] 構文エラーがないか（末尾の余分な文字、括弧の対応など）
- [ ] 冪等性があるか（`IF NOT EXISTS`, `IF EXISTS`を使用）
- [ ] NOT NULL追加時にデフォルト値またはデータ移行があるか
- [ ] ファイル末尾に改行があるか
- [ ] コミットメッセージと実際の修正内容が一致しているか

## Feature Implementation Workflow

1. **Plan First**
   - Use **planner** agent to create implementation plan
   - Identify dependencies and risks
   - Break down into phases

2. **TDD Approach**
   - Use **tdd-guide** agent
   - Write tests first (RED)
   - Implement to pass tests (GREEN)
   - Refactor (IMPROVE)
   - Verify 80%+ coverage

3. **Code Review**
   - Use **code-reviewer** agent immediately after writing code
   - Address CRITICAL and HIGH issues
   - Fix MEDIUM issues when possible

4. **Commit & Push**
   - Detailed commit messages
   - Follow conventional commits format

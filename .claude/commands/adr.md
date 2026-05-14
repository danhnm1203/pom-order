---
name: adr
description: Record an Architecture Decision Record (ADR). Captures the "why" behind design choices for future developers and AI agents. Use when making significant architectural, technical, or design decisions.
---

You are an ADR (Architecture Decision Record) specialist. Your job is to capture the reasoning behind architectural decisions so that future developers (and AI agents) can understand **why** the codebase is the way it is.

## When to Record an ADR

- New system component or service added
- Technology or library choice made
- Data model or schema design decision
- API design pattern chosen
- Security or authorization model change
- Integration approach with external service
- Performance optimization trade-off
- Migration strategy decision
- Convention or pattern established

## Process

### 1. Gather Context

- Ask the user what decision was made (if not already clear)
- Review relevant code to understand the current implementation
- Identify the alternatives that were considered
- Understand the constraints and trade-offs

### 2. Determine ADR Number

Check existing ADRs:
```bash
ls docs/architecture/decisions/
```

Use the next sequential number (e.g., if `0003-*.md` exists, create `0004-*.md`).

### 3. Write the ADR

Create the file at `docs/architecture/decisions/NNNN-kebab-case-title.md` using this format:

```markdown
# ADR-NNNN: Title

**Date**: YYYY-MM-DD
**Status**: accepted | superseded by ADR-XXXX | deprecated
**Deciders**: who was involved

## Context

What is the issue that we're seeing that is motivating this decision or change?
Include technical context, business constraints, and any relevant history.

## Decision

What is the change that we're proposing and/or doing?
Be specific about the approach chosen.

## Alternatives Considered

### Alternative A: [Name]
- **Pros**: ...
- **Cons**: ...
- **Why rejected**: ...

### Alternative B: [Name]
- **Pros**: ...
- **Cons**: ...
- **Why rejected**: ...

## Consequences

### Positive
- What becomes easier or possible as a result of this change?

### Negative
- What becomes harder or impossible as a result of this change?
- What technical debt does this introduce?

### Risks
- What could go wrong?
- What assumptions might prove wrong?

## Related

- Links to relevant code, PRs, issues, or other ADRs
- Files: `path/to/relevant/file.ts`
```

### 4. Update the ADR Index

After creating the ADR, update `docs/architecture/decisions/README.md` with a one-line entry:

```markdown
| NNNN | Title | accepted | YYYY-MM-DD |
```

If the README doesn't exist yet, create it:

```markdown
# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the UnlockOS project.
ADRs capture the **why** behind significant technical decisions.

| # | Decision | Status | Date |
|---|----------|--------|------|
| 0001 | ... | accepted | ... |
```

### 5. Update the ADR Overview

`docs/architecture/decisions/OVERVIEW.md` を開き、新規 ADR を適切なテーマセクションに追記する。

テーマカテゴリ（2026-04-21 時点）:
- 🎯 North Star（評価指標・製品方針）
- 💰 ビジネスモデル
- 🔑 プロダクトの骨格（SDK / Portal / Auth / 主要 Edge Function）
- 🔌 外部連携（PMS / OTA / LINE など）
- 🔐 セキュリティ・認可
- 🏗️ 運用基盤（個別機能・routing・ CI など）
- ⏸ Deferred / 未着手（proposed かつ受理条件あり）
- 🗂 廃止済み（Superseded by rules / skills）

ADR が既存テーマに収まらない場合、**新テーマ追加の妥当性を先にユーザーへ確認する**。
概念マップとしての可読性を保つため、テーマを無闇に増やさないこと。

超概要が変わる ADR（North Star / ビジネスモデル / 主要骨格レベル）の場合は、
OVERVIEW 冒頭の「UnlockOS とは」ナラティブの見直しも検討する。

## Guidelines

- **Focus on WHY, not WHAT** — the code shows what; the ADR explains why
- **Be honest about trade-offs** — every decision has downsides; document them
- **Keep it concise** — 1-2 pages max; if it's longer, the decision might need splitting
- **Link to code** — reference specific files, functions, or patterns
- **Record at decision time** — don't wait; context fades fast
- **Supersede, don't delete** — if a decision changes, mark the old one as superseded and create a new one
- **Write in the language the team uses** — Japanese or English, match the context

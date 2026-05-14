---
description: Mandatory security checks before commits. Secret management, input validation.
---

# Security Guidelines

## Mandatory Security Checks

Before ANY commit:
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitized HTML)
- [ ] CSRF protection enabled
- [ ] Authentication/authorization verified
- [ ] Rate limiting on all endpoints
- [ ] Error messages don't leak sensitive data

## Secret Management

```typescript
// NEVER: Hardcoded secrets
const apiKey = "sk-proj-xxxxx"

// ALWAYS: Environment variables
const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error('OPENAI_API_KEY not configured')
}
```

## Security Tooling Escalation

日常レビュー → **security-reviewer** エージェント（チェックリスト型）
深堀りが必要な場合 → Trail of Bits スキル（ツール駆動型）:

| トリガー | スキル | コマンド |
|---------|--------|---------|
| リリース前 | static-analysis + insecure-defaults + differential-review | `/deep-scan` |
| 依存追加/更新 | supply-chain-risk-auditor | `/dependency-audit` |
| API設計レビュー | sharp-edges | 直接呼出 |
| CI/CDワークフロー変更 | agentic-actions-auditor | 直接呼出 |

## Security Response Protocol

If security issue found:
1. STOP immediately
2. Use **security-reviewer** agent
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets
5. Review entire codebase for similar issues

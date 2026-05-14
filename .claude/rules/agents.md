---
description: Agent orchestration rules. When to delegate, parallel execution, model selection.
---

# Agent Orchestration

## Available Agents

Located in `~/.claude/agents/`:

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code review | After writing code |
| security-reviewer | Security analysis | Before commits |
| build-error-resolver | Fix build errors | When build fails |
| e2e-runner | E2E testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation | Updating docs |

## Global Skills (tool-based, ~/.claude/skills/)

| Skill | When to Use |
|-------|-------------|
| playwright-skill | Ad-hoc browser automation (screenshots, form fill, UX validation) |
| understand / understand-* | Codebase knowledge graph, onboarding, architecture visualization |
| differential-review | PR security review (blast radius, regression detection) |
| insecure-defaults | Config audit (fail-open patterns, hardcoded fallbacks) |
| sharp-edges | API design review (footgun detection, misuse resistance) |
| supply-chain-risk-auditor | Dependency audit (unmaintained, single-maintainer, typosquat) |
| static-analysis | Deep scan via Semgrep/CodeQL (pre-release) |
| agentic-actions-auditor | GitHub Actions security (injection, permission escalation) |

## Immediate Agent Usage

No user prompt needed:
1. Complex feature requests - Use **planner** agent
2. Code just written/modified - Use **code-reviewer** agent
3. Bug fix or new feature - Use **tdd-guide** agent
4. Architectural decision - Use **architect** agent
5. Dependency added/updated - Use **supply-chain-risk-auditor** skill
6. CI/CD workflow changed - Use **agentic-actions-auditor** skill

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth.ts
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utils.ts

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker

---
description: Hook system reference. PreToolUse, PostToolUse, Stop hook types and configuration.
---

# Hooks System

## Hook Types

- **PreToolUse**: Before tool execution (exit 2 = block). Validate commands, prevent dangerous ops
- **PostToolUse**: After tool execution. Auto-format, run linters, warn about issues
- **Stop**: When session ends (exit 2 = ask Claude to continue). Final verification

## Implemented Hooks (in .claude/settings.json)

### PreToolUse
- **dangerous-command-guard** (Bash): Blocks `db reset`, `rm -rf`, `git reset --hard`, `git push --force`, `DROP DATABASE`, `TRUNCATE`
- **markdown file warning** (Write): Warns when creating .md files outside docs/.claude/locales/

### PostToolUse
- **post-edit** (Edit|Write): Warns about console.log in .ts/.tsx/.js/.jsx files
- **adr-reminder** (Edit|Write): Reminds to create ADR when architectural files are changed (migrations, Edge Functions, package.json, tsconfig, .env, vite.config)
- **security-skill-reminder** (Edit|Write): Reminds about ToB skills when dependencies (package.json), config (.env), or CI/CD workflows (.github/) are changed

### Stop
- **stop-audit**: Audits all modified files for console.log before session ends

## Hook Scripts

All scripts in `.claude/hooks/`:
- `dangerous-command-guard.sh` — PreToolUse blocker
- `post-edit.sh` — PostToolUse console.log warning
- `adr-reminder.sh` — PostToolUse ADR reminder
- `security-skill-reminder.sh` — PostToolUse ToB skill reminder
- `stop-audit.sh` — Stop auditor

### User-level (~/.claude/settings.json)
- **git check** (Stop): Verifies no uncommitted/unpushed changes before session ends

## Hook Engineering Guidelines

- Exit code 2 = block/continue (depending on hook type)
- Matchers are regex (case-sensitive): `Edit|Write` not `edit|write`
- Keep scripts fast (<2s) to avoid blocking Claude
- Test scripts with `bash .claude/hooks/<script>.sh` before registering

## TodoWrite Best Practices

Use TodoWrite tool to:
- Track progress on multi-step tasks
- Verify understanding of instructions
- Enable real-time steering
- Show granular implementation steps

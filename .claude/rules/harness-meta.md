---
description: Harness self-improvement patterns, context budget management, and session continuity.
---

# Harness Engineering Meta-Rules

## Golden Principles Pattern

ミスを一度きりの修正で終わらせず、恒久的な制約に変換する：

1. **Observe**: ミスまたは非効率を検出
2. **Analyze**: 根本原因を特定（コンテキスト不足？ルール不明確？ツール設定不備？）
3. **Encode**: 修正を恒久的な制約に変換：
   - 行動ルール → `.claude/rules/` に追加
   - 自動実行 → `.claude/hooks/` にスクリプト追加 + `settings.json` に登録
   - ワークフロー → `.claude/skills/` にスキル追加
   - 繰り返しタスク → `.claude/commands/` にコマンド追加
4. **Verify**: 次のセッションで制約が機能することを確認

## Context Budget Guidelines

**目標: CLAUDE.md + 全グローバルルール合計 < 5,000 tokens**

| Component | Budget | Strategy |
|-----------|--------|----------|
| CLAUDE.md | ~1,500 tokens | リーンなインデックス、詳細はルールに委譲 |
| Global rules | ~3,000 tokens | フロントマターで path-scope、必要時のみロード |
| Skills | On-demand | フロントマターの `description` でセマンティックマッチ |
| Agents | Isolated | 独自コンテキストウィンドウ、親に結果のみ返す |

**コンテキスト節約の原則:**
- CLAUDE.md に運用詳細を入れない（ルールに委譲）
- ルールの重複を排除（1つの事実は1箇所に）
- 大きなスキルは分割を検討（500行超の場合）
- path-scoped ルールを活用して不要なロードを防ぐ

## Session Continuity Pattern

長時間タスクがコンテキストウィンドウを超える場合：

1. **Progress file**: `claude-progress.md` に現在の状態を記録
2. **Git history**: コミットメッセージに十分な情報を含める
3. **TodoWrite**: マルチステップタスクの進捗を追跡
4. **次セッション**: progress file + git log から状態を復元

## Harness Health Metrics

定期的に以下を確認：
- [ ] CLAUDE.md が100行以下か
- [ ] 全ルールにYAMLフロントマターがあるか
- [ ] 全スキルにname/descriptionフロントマターがあるか
- [ ] エージェントのモデル選択が適切か（opus=推論重い、sonnet=バランス、haiku=軽量）
- [ ] hooks が実際に動作しているか（settings.json に登録されているか）
- [ ] ルール間に重複がないか

## Model Selection Quick Reference

| Task Type | Model | Examples |
|-----------|-------|---------|
| Deep reasoning | opus | architect, planner, security-reviewer |
| Balanced work | sonnet | tdd-guide, code-reviewer, build-error-resolver, e2e-runner, refactor-cleaner |
| Content generation | haiku | doc-updater, help-docs-creator |

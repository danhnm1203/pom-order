---
description: Database migration workflow. Idempotency, local-first, type generation.
globs: supabase/**
---

# Database Migration Rules

## マイグレーションファイル命名規則

**標準コマンド:** `supabase migration new "file_name"` → `YYYYMMDDHHmmss_file_name.sql`

**暫定ルール（〜2026-05-01）:** 最新の適用済みファイルが `20260501200000` のため、自動生成タイムスタンプが追い越すまで手動でインクリメント:
```
20260501200001_your_migration.sql
20260501200002_next_migration.sql
```
- 日付部分（`20260501`）は変更しない
- 時刻部分のみインクリメント
- 適用済みファイルのリネームは禁止（`schema_migrations` と不整合になる）

**2026-05-01以降:** `supabase migration new "name"` を常に使用。

## Migration Workflow (CRITICAL)

### 1. ローカル→リモートの順序厳守

```bash
# 1. ローカルDBでマイグレーションを適用・テスト
supabase migration up --local

# 2. ローカルで動作確認

# 3. リモートDBにプッシュ
supabase db push

# 4. リモートの型を生成して比較
supabase gen types typescript --linked > /tmp/remote_types.ts
diff src/types/supabase.ts /tmp/remote_types.ts
```

### 2. マイグレーション適用後の必須チェック

**毎回必ず実行:**
```bash
# リモートDBの型を生成
supabase gen types typescript --linked > /tmp/remote_types.ts

# ローカルの型と比較（差分があれば問題）
diff src/types/supabase.ts /tmp/remote_types.ts
```

差分がある場合:
- リモートDBのスキーマが期待と異なる
- マイグレーションが途中で失敗している可能性

### 3. マイグレーションファイルの品質チェック

**PRレビュー時の必須確認:**
- [ ] SQLファイルの構文エラーがないか（末尾の余分な文字など）
- [ ] `CREATE TABLE IF NOT EXISTS`で冪等性を確保
- [ ] `DROP ... IF EXISTS`で安全な削除
- [ ] NOT NULL制約の追加時はデフォルト値またはデータ移行を含める
- [ ] ファイル末尾に改行があるか

### 4. 冪等性の確保（CRITICAL）

マイグレーションは**何度実行しても同じ結果**になるように:

```sql
-- GOOD: 冪等
CREATE TABLE IF NOT EXISTS my_table (...);
DROP VIEW IF EXISTS my_view;
CREATE INDEX IF NOT EXISTS idx_name ON table(column);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE ...) THEN
    ALTER TABLE ... ADD COLUMN ...;
  END IF;
END $$;

-- BAD: 非冪等（2回目でエラー）
CREATE TABLE my_table (...);
ALTER TABLE my_table ADD COLUMN new_col TEXT;
```

### 5. エラー発生時の対処

マイグレーションが途中で失敗した場合:

```bash
# 1. マイグレーション履歴を確認
supabase migration list

# 2. 失敗したマイグレーションをrevertedに
supabase migration repair --status reverted <timestamp>

# 3. マイグレーションファイルを修正

# 4. 再適用
supabase db push
```

## 絶対にやってはいけないこと

- `supabase db reset` をローカルでも本番でも実行しない
- マイグレーション履歴を手動で削除しない
- 本番DBに直接SQLを実行しない（必ずマイグレーション経由）
- マイグレーションファイルを適用後に編集しない（新しいマイグレーションを作成）

## トラブルシューティング

### ローカルとリモートのスキーマ不一致

```bash
# リモートDBの現在のスキーマを確認
supabase gen types typescript --linked

# 差分を確認
supabase db diff --schema public --use-migra
```

### マイグレーションが「適用済み」だがスキーマが不完全

原因: マイグレーション実行中にエラーで中断したが、履歴には記録された

対処:
1. 修復用マイグレーションを新規作成
2. `IF NOT EXISTS`/`IF EXISTS`で冪等に書く
3. 不足分のみを追加

### 型定義の更新

マイグレーション適用後は必ず型を更新:

```bash
supabase gen types typescript --local > src/types/supabase.ts
```

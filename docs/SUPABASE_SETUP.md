# Supabase 專案接續設定

使用者已提供 Project URL：`https://bqoqzxharmatphcqwldo.supabase.co`。

目前只確認端點可連到，無憑證的 Auth health 請求回傳 401。這不代表
已完成資料庫初始化、登入、Storage 或真實出刊。執行環境尚無 API key、
資料庫管理憑證，也沒有可共用使用者登入的 Supabase 瀏覽器 session。

## 第一步：初始化空專案

從 source checkout 產生一份合併 SQL：

```sh
node scripts/build-supabase-bootstrap.mjs https://bqoqzxharmatphcqwldo.supabase.co
```

在此專案的 SQL Editor 新建查詢，貼上整份 `output/DayDay_Supabase_Setup.sql`
並執行。執行前確認 dashboard 的 project ref 是 `bqoqzxharmatphcqwldo`。

合併檔保留 14 份 migration 的原文、順序與 SHA-256；只在新的空 public schema
與空 Storage 執行。任何一份失敗都回滾整批；重複執行或碰到既有資料會停止，
不會清除資料。成功後的 `dayday_setup_result` 應包含：

- `status: schema_initialized`、`migration_count: 14`。
- `issue_count: 0`、`member_count: 0`。
- `publishing.mode: review`、`publishing.live_enabled: false`。

這是 schema 初始化成功，**不是已經發布一期新聞**。手動初始化的記錄在
不對 Data API 開放的 `dayday_private.schema_migrations`；不要接著直接重跑
CLI 的 `db push`，應先依這份記錄核對／同步 migration history。

## 之後的設定，等第一步成功再做

1. 在 Authentication 關閉開放自行註冊，設定家長登入與 site_members 權限。
   SQL 不會自行寄邀請或建立兒童帳號。
2. 取得 publishable key，配置讀者網站；service-role 僅放背景 runner 的 secret。
3. 實測 anonymous／reader／inactive reader／admin 的 Data API 與私人 PDF 權限。
4. 再設定 NVIDIA key、來源權利、真實稿件及人工核准；排程保持停用。

資料庫密碼、service-role、NVIDIA key 不要貼聊天或提交 Git。

# Supabase 專案接續設定

2026-11-20：已完成新庫初始化與線上存取驗證。

- Marketplace 資源 `supabase-dayday-dailidigest`（`store_xrvsYjcFCPf6d8cC`）available，連至 `ckm13/daily-digest`（`prj_AoSHUcgOzOtlJ1M1Nv47DfKKZ9XY`）。
- 新 Project URL：`https://oaeihtxvtljnpzuxqtvc.supabase.co`。其整合變數加有 `DAILY_DIGEST_` 前綴；編輯室優先使用這組完整設定，沒有與舊庫混用。
- 在 Vercel Function 中，以核對過同專案的 PostgreSQL 連線檢查到 public 表及 buckets 均為 0，才以單一交易完成 15 份 migration。結果為 18 張 public 表、3 個私有 bucket、app_settings 已啟用 RLS。
- Supabase 官方下載的 Root 2021 CA 已設為 `SUPABASE_DB_CA`，TLS 同時驗證憑證與主機名。憑證下載來源與官方 dashboard 一致：`https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`，SHA-256 `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`。
- 線上 REST 文件建立、version compare-and-swap 更新、讀回及私有 Storage 上傳／下載／簽名 URL 建立均通過；測試檔案已移除，保留 health 文件作驗證紀錄。`/api/editorial/status` 回報 databaseConnected=true、databaseError=null。
- 本次初始化使用只限 setup API 的 15 分鐘授權，不授予編輯室 session，完成後移除 `EDITOR_SETUP_TOKEN` 並重新部署。Sensitive 的正式金鑰沒有匯出到本機或聊天。

日常操作入口為 `/editor`；已初始化的新庫不用再執行 SQL。`/editor/setup` 保留供管理密碼授權的檢查，遇到非空庫會拒絕再次初始化。舊專案未更動。以下為舊專案歷史紀錄，並非新庫網址。

使用者已提供 Project URL：`https://bqoqzxharmatphcqwldo.supabase.co`。

使用者已回報 SQL Editor 執行成功：schema_initialized、migration_count 14、
issue_count 0、member_count 0，publishing.mode 為 review、live_enabled 為 false。
這是使用者提供的雲端初始化結果；尚未以 Data API／Auth／Storage 實測。

使用者目前只有開發者本人使用，已要求先測 NVIDIA 生成。家長帳號、邀請與
登入設定暫緩，並非 API 試生成的前置條件；見 NVIDIA_PREVIEW.md。

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

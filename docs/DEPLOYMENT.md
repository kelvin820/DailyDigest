# 部署指南（目前未部署）
## 先完成工程驗收
本交付尚無成功 Next.js build 與完整 live pipeline。**不能只填金鑰就啟用 daily workflow**。先依 STATUS 的下一步完成並通過測試。
1. Node 24、pnpm 10；pnpm install 後提交 lockfile。之後 CI 用 pnpm install --frozen-lockfile。
2. pnpm typecheck、pnpm lint、pnpm test、pnpm build、六 PDF 檢查。
3. 建立獨立 GitHub repo，不覆蓋 quiet-hours 或其他網站；只推程式，忽略 output / .runtime / .env。

## Supabase
1. 全新專案 SQL Editor 依序套用 supabase/migrations 三檔；先在開發專案測試。
2. Auth 關閉開放註冊，以管理控制台邀請家長；設定密碼登入。email 流程與 SMTP 需現場確認。
3. 在 Auth 找管理員 UUID，使用 SQL Editor 插入 site_members(user_id,role) values ('實際 UUID','admin')。
4. 其他受邀帳號插入 reader。不能由使用者自己寫 role。
5. buckets issue-files/evidence/images 全部 private；不開 public。
6. 以 anonymous / reader / admin 實際測試 raw evidence、jobs、settings、draft、published、PDF signed URL 與 approve；不可僅看 SQL。

## Vercel
Import 此新 repo，framework Next.js，Node 24。環境：
- NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- APP_URL = 新專案實際 URL，APP_TIMEZONE=Asia/Taipei
- DEMO_MODE=false。Preview 若只做 DEMO，使用隔離設定 true，不連 production DB。
- 如使用 dispatch API：GITHUB_REPOSITORY、GITHUB_DEFAULT_BRANCH、GITHUB_DISPATCH_TOKEN（該 repo Actions write 最小權限）。
Reader 網站不需要 LLM_API_KEY。Service role 不放 NEXT_PUBLIC。

## GitHub Actions production environment
僅在完整 live E2E 成功後配置：
- LLM_API_KEY secret；實際 provider URL/model 與價格 variables
- Supabase service role（待 durable worker 整合）
- PUBLISH_MODE=review；DAILY_BUDGET_USD 初始 2，由使用者確認。
排程台北 06:17 / 07:17，以 UTC 22:17 / 23:17。GitHub 不保證準點，可手動補跑。
現有 DD_PIPELINE_ACCEPTED guard 與 preflight 均阻止執行；在真實整合驗收完成前保留。不要用改成 return 0 來假造驗收。
第一期人工檢查八則、三版、來源、圖片、PDF；只有 RPC gate pass 才發布。


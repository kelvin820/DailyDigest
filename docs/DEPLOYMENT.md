# 部署指南（尚未部署）

## 專案與可重現檢查

在獨立 GitHub repo 使用 Node 24、pnpm 11.25.0。提交 pnpm-lock.yaml、pnpm-workspace.yaml（只允許 esbuild build script），CI 使用 frozen install。先跑 README 的 typecheck、lint、test、build、PDF、test:app、test:db。不要覆蓋其他網站。

## Supabase

在全新開發專案，依檔名排序套用 supabase/migrations/ 的 14 檔。前 3 檔保留原交付，其餘新增修訂、額度、intake、試讀與 auto。尚未對任何雲端 DB 執行。

關閉開放自行註冊，邀請家長、設定密碼與 email／SMTP；在 SQL Editor 以實際 Auth UUID 建立 site_members(admin/reader)，不以兒童 email 建帳。全部 bucket（issue-files/evidence/images）維持 private。只有 worker 取得 service-role；讀者與編輯室以 session + RLS／窄範圍 RPC 存取。

實測 anonymous、reader、inactive reader、admin：草稿、內部來源、jobs/settings、published payload、私有 PDF signed URL、修訂、核准、來源證據。腳本的本機 PostgreSQL stubs 不能取代這一層。

## Vercel

匯入新 repo，Next.js，Node 24。先在隔離 preview 做 DEMO；正式私人站設定 DEMO_MODE=false、APP_URL=實際 HTTPS URL、NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。網站不需要 LLM_API_KEY 或 Supabase service-role。

需要編輯室派送時，另設 GITHUB_REPOSITORY、GITHUB_DEFAULT_BRANCH、只限該 repo 的 GITHUB_DISPATCH_TOKEN；live 驗收後設 DD_PIPELINE_ACCEPTED=true。未設定則顯示禁用，沒有假成功。

先驗收登入、最近一期／日期過期提示、三版、歷史、PDF private redirect、admin 權限；記錄 preview 與 production URL 到 STATUS。現在沒有部署 URL。

## 第一份 live 與排程

GitHub production environment 的 Secrets：LLM_API_KEY（NVIDIA）、SUPABASE_SERVICE_ROLE_KEY。Variables：APP_URL、NEXT_PUBLIC_SUPABASE_URL、writer/reviewer 型號、預算與可確認的 token 單價。初始 PUBLISH_MODE=review。

先用人工 APPROVED_FACTS_FILE 或核准完整來源政策後的 worker 完成一期 live E2E。核對來源、日期、三版、圖片類型、六份 PDF、實際 usage，再由管理者核准。人工入口預設 DRAFT_ONLY=true。

自動來源另外需要：status=enabled、discovery_enabled/fetch_enabled=true、rewrite_policy=allowed、reviewed_at、robots_reviewed_at、robots_allowed=true，以及 evidence_policy=permanent_excerpt。啟用前人工確認條款與可永久保留必要摘錄的範圍；全文僅在記憶體處理。模型不能自己授權。

真正通過後才把 GitHub variable DD_PIPELINE_ACCEPTED 設 true。daily-digest.yml 綁定 default branch、production environment、最小讀 repo 權限；台北 06:17 主跑／07:17 補跑。時間可能延遲，並非準點 SLA。手動輸入只放 env，再經 schema 驗證，不拼 shell。

auto：三個不同日期的 live 期刊經家庭試讀，在各期管理頁記錄觀察；設定頁才能切 auto。再將 runner PUBLISH_MODE=auto，並允許 DRAFT_ONLY=false。敏感稿件仍留在 needs_review；不能繞過 hard gates。

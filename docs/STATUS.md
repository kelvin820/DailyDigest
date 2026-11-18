# 實作狀態 — 2026-11-18（台北）

從使用者提供的 M1 原始碼、public 與 output 接續；原始交付另存於工作區供比對。下表區分「程式／離線證據」與「外部服務實測」，不是 M0–M5 全部完成。

2026-11-18 已將原始碼推送備份至 https://github.com/kelvin820/DailyDigest 的 main 分支。此備份不代表部署或真實出刊完成；output 樣刊與驗證產物仍保留在獨立 review archive。

初次備份的 GitHub CI 已通過。私人靜態閱讀 DEMO：https://dayday-digest-demo.kelvin820.chatgpt.site 。依使用者回饋，小學表頭保留，國中試用 Instrument Serif、高中試用 Libre Caslon Text 粗體，網頁與 PDF 同步；詳見 MASTHEADS.md。這是虛構樣刊預覽，不是真實每日出刊。

| 里程碑 | 本輪完成／驗證 | 尚待完成 |
|---|---|---|
| M0 | Node 24、pnpm 11 固定版本、實際 lockfile、frozen install、typecheck/lint/build；CI 更新 | 在目標 GitHub repo 跑雲端 CI |
| M1 | 保留原設計；正式 Next.js 首頁、歷史、單篇、切版、詞彙、手動已讀、profile；三尺寸瀏覽器驗證；六份兩頁 PDF 全文、字體與最低字級驗證；儲存拒絕時仍可讀 | 使用者／孩子試讀回饋；正式站下載驗收 |
| M2 | 新增修訂／核准 UI、事實與 review 檢視、工作步驟／用量、派送禁用狀態、試讀記錄與 auto 切換；14 個 migration；RLS、不可變版本、快照核准、私有檔案與交易測試 | 真實 Supabase Auth/邀請/SMTP/PostgREST/Storage signed URL 角色矩陣與部署 |
| M3 | RSS/正文抽取、robots、DNS pinning/代理、來源政策、事件去重、select/facts、三版 write/review/revise、NVIDIA Nemotron adapter；人工底稿入口；同一 worker 私有上傳／staging；NASA/NOAA/BBC 只讀稽核成功 | NVIDIA key、模型真實 JSON/難度/費率驗收；來源人工核准與足夠分類供稿；一期 live E2E。已發生網路稽核，不代表新聞改寫／出刊成功 |
| M4 | durable steps、canonical JSON hash、lease/heartbeat、凍結事實、跨 runner 每日額度、unknown usage 保留、resume/force、新版 PDF 驗證、auto 三期門檻；並行 runner 與預算交易測試；daily/catch-up 配線 | 真實 runner crash/重跑與花費核對；DD_PIPELINE_ACCEPTED 保持關閉 |
| M5 | 可重現操作與部署指南、樣刊、截圖、測試證據、設定清單 | GitHub/Vercel/Supabase 專案設定、preview/production URL、至少三期家庭試讀 |

## 已有證據

- 單元與合約測試：34 項通過，包括 Nemotron 請求、格式修復用量、同一 facts 三版、來源注入／SSRF、去重、快取及預算。
- output/app-verification.json：正式 Next.js 的三版 × 375/768/1440、API 正文比對、六 PDF 下載、手動進度、profile、歷史、單篇、DEMO 寫入拒絕；無外部模型請求。
- output/qa-report.json、pdf-verification.json、preview/render-manifest.json：六份皆兩頁、八篇全文與詞彙可抽取、字體嵌入，正文最低 13/12/11pt，實際模板為 14/12/11pt。
- output/db-verification.json：隔離 PostgreSQL，模擬 Supabase auth/storage 契約；角色矩陣、原子 staging/approval、lease 接手、額度、auto 與並行測試。**不是已連線 Supabase 的證據**。
- docs/source-audit-evidence.json：實際讀取候選來源的 robots、條款與 RSS；未改變任何來源權利狀態。

## 尚未發生的事情

沒有真實 NVIDIA API 回應、真實生成費用、真實 Supabase 儲存／發布、Vercel URL，或家庭試用紀錄。所有樣刊仍是 DEMO；測試資料庫中的「published」只存在於銷毀式合成測試，不算 A18。

使用者已指定先用 NVIDIA Nemotron；不再等待供應商選擇。待設定項目集中於 SETUP.md。沒有建立其他網站或購買方案。

表頭第二輪：DEMO 閱讀頁新增「表頭試字」入口；mastheads.html 提供八款新候選與上一輪兩款對照，可切換紙色、字重、字寬與字距。選定前不改動閱讀頁或 PDF 預設。四尺寸、十款字型實際載入、選擇記憶與儲存拒絕檢查通過。

Supabase 接續：已取得 https://bqoqzxharmatphcqwldo.supabase.co ，未帶憑證的 Auth health 請求回傳 401。已準備 14 份 migration 的單一交易初始化 SQL，並在隔離 PostgreSQL 驗證初始化、重跑拒絕、保留既有資料及中途失敗回滾。證據：output/supabase-bootstrap-verification.json；操作見 SUPABASE_SETUP.md。尚未對此雲端專案套用 SQL，也沒有取得任何 API key。

表頭選定：使用者指定國小 H（Playfair Display）、國中 C（Old Standard TT Bold），高中不改。國小採 H 預設 600／92%／-0.030em；國中沿用當前試字頁的 700／70%／-0.070em。已同步閱讀網頁與六份兩頁 PDF，正文與署名保留原設計。最新設定以 MASTHEADS.md 的 Current approved selection 為準。

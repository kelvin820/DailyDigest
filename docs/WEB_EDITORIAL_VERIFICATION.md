# 網頁編輯室驗證 — 2026-11-20

## 本機已驗證

- `pnpm test`：87 項通過，包含原管線與新增網頁工作、整期 24 個模型步驟、單篇隔離、冪等、租約／未知用量停止、共用預算、人工核准、Marketplace 變數配對、限時初始化授權與空庫初始化守衛測試。
- `pnpm lint` 與 `pnpm build` 通過。
- Vercel 生成／發布 Functions 的檔案追蹤含 Chromium 二進位與必要字體，單個 trace 約 147 MiB。
- `qa-web-editorial.mjs` 通過：實際 Chrome 操作解鎖、單篇重新生成；實際 Next.js API 儲存 synthetic Supabase 文件；兩個模擬模型回應；真實 Chromium 製作六份 PDF；未發布稿／PDF 不對匿名讀者公開；重新整理不再呼叫模型；網頁核准後從資料庫讀回首頁、月曆與正式 PDF。
- `qa-publications.mjs` 通過：歷史閱讀、月曆、公開審查、PDF 與原管理 API 寫入保護。
- `qa-preview-reader.mjs` 通過：三版與三尺寸、正文與 API、圖片、六 PDF、閱讀進度、管理操作拒絕。
- 六份待審 PDF 皆兩頁；pypdf 可抽取英文與繁體中文，已檢查部首別名不再混入。已視覺查看手機編輯室與 PDF 第一頁。

本機外部服務使用隔離模擬資料，不消耗真實 NVIDIA 額度、不寫正式 Supabase，也不冒充線上生成已驗收。圖片沿用同事件核准快照，未增加生圖 API。

## 線上驗證界線

部署前舊版 `/api/editorial/status` 已確認 NVIDIA key 與 Supabase service key 存在；使用者後續回報已設定 `EDITOR_ACTION_SECRET`。新版本的 `databaseConnected` 會實際讀取既有文件表以驗證連線。正式編輯室解鎖與真實生成需在新部署上驗收；本頁不記錄管理密碼、API key 或 cookie。

首次正式部署 `26abe78` 已成功，GitHub CI run `44647877802` 全部通過，包含新增網頁端到端測試。正式站編輯室回傳 200、NVIDIA／管理密碼變數存在；實際資料庫檢查回報 `databaseConnected=false`，因此不能宣稱正式生成與存檔已驗收。後續增加不含憑證的分類診斷，並在資料庫故障時保留公開閱讀的 Git 存檔。

後續已確認 Vercel 原生資源 `supabase-dayday-dailidigest` 已連至 `daily-digest`，新整合使用 `DAILY_DIGEST_` 前綴。`4393f67` 修正新舊變數優先順序並部署初始化工具；後端使用 Sensitive PostgreSQL 設定，核對 API URL／DB 的 project ref 一致及空庫狀態。補入 Supabase 官方 CA 後，以驗證憑證與主機名的 TLS 成功連到 `oaeihtxvtljnpzuxqtvc`。

2026-11-20 09:40（台北）：正式 API 檢查得到空庫（0 public 表、0 buckets），隨即以單一交易完成 15 份 migration。初始化結果為 18 張 public 表、3 個私有 bucket、editorTable=true、editorRls=true。接著在真正 Supabase Data API 建立 health 文件、version=1→2 compare-and-swap 及讀回；真正 Storage 完成測試檔上傳、內容下載比對、signed URL 建立並刪除測試檔。四項檢查均為 true；正式 status 為 databaseConnected=true、databaseError=null、generationBackend=vercel。原資料庫未修改。

本次只限 setup API 的短效授權不會建立管理 session，完成後移除設定並重新部署。此輪未呼叫正式 NVIDIA，也未生成或發布正式新刊；模型與完整 PDF 管線的驗證仍為上述隔離端到端測試。不能把正式 DB／Storage 成功誤記為正式模型生成已驗收。

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

後續已確認 Vercel 原生資源 `supabase-dayday-dailidigest` 已連至 `daily-digest`，網站已選用 Marketplace secret／URL。初始化頁 `/editor/setup` 在 Vercel 內使用 Sensitive PostgreSQL 設定，核對專案、空庫及管理密碼後才執行 SQL；本機僅使用模擬 client 驗證拒絕非空庫、拒絕目標不符與失敗回滾。正式資料庫初始化及真實生成仍須在網站完成後另記結果，不能把頁面部署當作初始化已成功。

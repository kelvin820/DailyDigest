# 網頁編輯室驗證 — 2026-11-20

## 下午修復與正式驗收

已在真正 Vercel Function → NVIDIA → Supabase 流程救回使用者第二次工作 `c47f9fec-013a-4939-b6a8-bbe878c79025`，刊物日期 2026-11-20。三版十二篇正文與十二份模型複核均已儲存；六份私有 PDF 全部成功生成、一頁四篇、細線分隔。狀態 `needs_review`、`canPublish=true`，尚未代替使用者核准發布。

- 前兩次失敗實際停在第一篇小學稿：glossary 的 dormant／bloom 未以相同字形出現在正文。三次全文重寫未解決，舊錯誤又因含小寫 story ID 被概括成 GENERATION_FAILED。改為具體檢查回饋，以及只從正文實際字形選詞的獨立 glossary 修訂；正文保留，修訂與複核仍計入共用預算。舊 checkpoint 被取代時另存 archived key。
- 真正進入 PDF 後，又發現部署缺少 `playwright-core/browsers.json`，錯誤發生於載入引擎之前。`a09b5e0` 補入完整 Playwright runtime；新增 `qa-pdf-runtime-trace.mjs` 檢查三條相關 Function trace 的 metadata、核心程式、Chromium、字體及 CSS，且禁止環境檔被追蹤。
- 2026-11-20 下午（台北）讀回正式六份 PDF，SHA-256 與資料庫 manifest 全部相符。pypdf 驗證全部 headline、正文、三種 vocabulary 欄位、字體內嵌及最低正文 13／12／11pt 均通過；已目視三版整頁 PNG，無文字裁切、重疊或漏圖。產物與證據在 Git 忽略的 `output/pdf/production/`。
- 第二次工作累計 35 次模型回應、53,166 input tokens、7,617 output tokens，包含原失敗及修復階段；PDF 重試未增加模型呼叫。第一個失敗工作原樣保留，不為了驗收而重複生成另一整期。未設定費率，沒有宣稱實際美元費用。
- 本機瀏覽器端到端驗證另外模擬一次 Storage 500，按「只重試 PDF」後恢復並完成六份 PDF，模型呼叫維持兩次；新稿核准發布及歷史稿「審核通過並放行」均驗證到首頁／日曆／PDF 讀回。正式稿仍等待使用者審核。
- 臨時維護授權只供本次資料診斷與恢復，沒有產生編輯室 session；完成後移除 `EDITOR_SETUP_TOKEN` 並部署撤銷。

## 本機已驗證

- `pnpm test`：90 項通過，包含原管線與網頁工作、單篇隔離、冪等、租約／未知用量停止、共用預算、人工核准、Marketplace 變數配對、限時初始化授權、空庫初始化、詞彙單獨修訂及 PDF 重試測試。
- `pnpm lint` 與 `pnpm build` 通過。
- Vercel 生成／發布 Functions 的檔案追蹤含 Chromium 二進位與必要字體，單個 trace 約 147 MiB。
- `qa-web-editorial.mjs` 通過：實際 Chrome 操作解鎖、單篇重新生成；實際 Next.js API 儲存 synthetic Supabase 文件；兩個模擬模型回應；真實 Chromium 製作六份 PDF；未發布稿／PDF 不對匿名讀者公開；重新整理不再呼叫模型；網頁核准後從資料庫讀回首頁、月曆與正式 PDF。
- `qa-publications.mjs` 通過：歷史閱讀、月曆、公開審查、PDF 與原管理 API 寫入保護。
- `qa-preview-reader.mjs` 通過：三版與三尺寸、正文與 API、圖片、六 PDF、閱讀進度、管理操作拒絕。
- 新版四篇樣本的六份 PDF 均為一頁；pypdf 檢查全部正文／詞義、內嵌字體與最低字級通過。已視覺查看小學及高中整頁：雙欄四區、細線分隔，沒有裁切或重疊。實際頁數只作紀錄，沒有固定兩頁的驗收條件。

本機外部服務使用隔離模擬資料，不消耗真實 NVIDIA 額度、不寫正式 Supabase，也不冒充線上生成已驗收。圖片沿用同事件核准快照，未增加生圖 API。

## 線上驗證界線

部署前舊版 `/api/editorial/status` 已確認 NVIDIA key 與 Supabase service key 存在；使用者後續回報已設定 `EDITOR_ACTION_SECRET`。新版本的 `databaseConnected` 會實際讀取既有文件表以驗證連線。正式編輯室解鎖與真實生成需在新部署上驗收；本頁不記錄管理密碼、API key 或 cookie。

首次正式部署 `26abe78` 已成功，GitHub CI run `44647877802` 全部通過，包含新增網頁端到端測試。正式站編輯室回傳 200、NVIDIA／管理密碼變數存在；實際資料庫檢查回報 `databaseConnected=false`，因此不能宣稱正式生成與存檔已驗收。後續增加不含憑證的分類診斷，並在資料庫故障時保留公開閱讀的 Git 存檔。

後續已確認 Vercel 原生資源 `supabase-dayday-dailidigest` 已連至 `daily-digest`，新整合使用 `DAILY_DIGEST_` 前綴。`4393f67` 修正新舊變數優先順序並部署初始化工具；後端使用 Sensitive PostgreSQL 設定，核對 API URL／DB 的 project ref 一致及空庫狀態。補入 Supabase 官方 CA 後，以驗證憑證與主機名的 TLS 成功連到 `oaeihtxvtljnpzuxqtvc`。

2026-11-20 09:40（台北）：正式 API 檢查得到空庫（0 public 表、0 buckets），隨即以單一交易完成 15 份 migration。初始化結果為 18 張 public 表、3 個私有 bucket、editorTable=true、editorRls=true。接著在真正 Supabase Data API 建立 health 文件、version=1→2 compare-and-swap 及讀回；真正 Storage 完成測試檔上傳、內容下載比對、signed URL 建立並刪除測試檔。四項檢查均為 true；正式 status 為 databaseConnected=true、databaseError=null、generationBackend=vercel。原資料庫未修改。

上午初始化時尚未呼叫正式 NVIDIA，當時僅確認 DB／Storage。下午追加的正式生成與 PDF 驗收見本頁開頭；正式工作仍停在待審狀態。

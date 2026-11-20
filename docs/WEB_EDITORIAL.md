# 網頁編輯室 — 2026-11-20

日常入口為 `/editor`。輸入 Vercel 的 `EDITOR_ACTION_SECRET` 解鎖後，可直接在網站製作整期、重新生成單篇、查看 log、下載 PDF 和核准發布。NVIDIA 請求由 Vercel Node.js Functions 執行，不派送 GitHub Actions。

## 操作

1. 在編輯室選四篇已核對來源，確認刊物日期與編輯方向，按「生成三版刊物」。目前來源庫仍是已核對的底稿，不宣稱已完成自動新聞發現；過期、未來或缺少核對的來源會被拒絕。
   同一事件沿用已核准的照片與分齡插畫並凍結配圖快照；沒有核准配圖的故事使用明確標示的原創分類圖示。本次不增加自動生圖請求。
2. 網頁持續呼叫後端，每次最多執行一個模型步驟。成功回應立即存進 Supabase。離開頁面會在目前步驟完成後暫停，重新開啟同一份工作可繼續。工作狀態不依賴瀏覽器記憶體或 Vercel 暫存檔案。
3. 三版完成後，由 Vercel 的無頭 Chromium 製作彩色／省墨共六份 PDF，沿用報紙 HTML、字體與自然分頁檢查，存進私有 `issue-files` bucket。
4. 審閱三版、來源、模型評語與 PDF。可直接重新生成特定故事的一個或三個程度；其他文章保留。新版本另外儲存。
5. 勾選已審閱後發布。後端重新驗證版本指紋、十二份 review、分級選字和六份 PDF 的 SHA-256／頁數，再原子寫入發布快照。首頁與日曆立即從資料庫讀回；不需要重新部署才能換刊。

## 必要變數

- `NEXT_PUBLIC_SUPABASE_URL` 與同一專案的 `SUPABASE_SERVICE_ROLE_KEY`。
- `LLM_API_KEY`，沿用 NVIDIA；writer/reviewer 以各自環境變數覆寫，預設 Ultra。
- `EDITOR_ACTION_SECRET`：至少 24 字元。只放 Vercel server 環境，不加 `NEXT_PUBLIC_`。使用者在網頁輸入後取得 8 小時 HttpOnly、SameSite=Strict 簽章 cookie；不把密碼放入 URL、localStorage 或 log。HTTPS 使用 Secure cookie。
- `DAILY_BUDGET_USD`、`MAX_MODEL_CALLS`、`MAX_MODEL_TOKENS`、可選的輸入／輸出單價。未知單價不冒充免費或美元預算已實測。

`GET /api/editorial/status` 只提供是否設定與資料庫連線是否成功，不回傳金鑰。新增或修改 Vercel 環境變數後需部署，才會進入該部署的執行環境。

伺服器支援新版 `sb_secret_...` 與舊版 service_role JWT。新版只透過 `apikey` 傳送，避免被當成 JWT Bearer；舊 JWT 行為保留。相容處理依 Supabase 的 API keys 文件，且另有實際 transport headers 測試。診斷區分憑證拒絕、缺少資料表權限、schema 缺失和網路失敗；不回傳原始憑證或回應內容。

## 資料位置與版本

沿用既有 migration 1 已建立且開啟 RLS 的 `app_settings` 文件表，不需要重跑初始化 SQL 或補新的 schema。所有新資料使用 `dayday:web:v1:` 命名空間，與原本 `publishing` 設定分開：

若診斷為 `DATABASE_PERMISSION_DENIED`，在同一個 Supabase 專案的 SQL Editor 執行 `supabase/patches/web-editorial-access.sql`。這是可重跑的窄範圍 service_role 授權補丁，僅授予 public schema 使用與 app_settings 的 SELECT／INSERT／UPDATE；不改 RLS、不開放匿名權限、不更動原 schema migration 歷史。

- `job:<UUID>`：不可混用的來源／模型／Prompt 快照、請求、成功 checkpoints、執行租約、進度、錯誤、用量、待審三版與 PDF manifest。
- `release:<YYYY-MM-DD>`：該日目前已核准版本的完整快照與人工核准方法 `web_manual`。舊工作仍保留，可追查；同一天不能用較舊工作覆蓋較新發布。
- `usage:<台北日期>`：網頁生成共用的呼叫／token／已知金額預留帳本，跨 Function instance 生效。
- `login:<分鐘>`：共用登入速率限制。這些也是伺服器紀錄，未開放匿名資料表讀取。

更新使用 JSON `version` 的 compare-and-swap，搶租約和發布衝突不會無條件覆寫。使用 service role 的程式只存在伺服器；瀏覽器透過經授權的 API 操作，沒有新增匿名寫入權限。未發布 PDF 需編輯室授權，已發布 PDF 由後端建立短效 signed URL。

原 Git catalog 仍作歷史存檔和首次發布前的閱讀內容；同日的網頁核准版優先。編輯室在資料庫存取失敗時明確報錯，不會假裝生成成功；公開閱讀會回到 Git 存檔並在伺服器記錄 fallback，避免資料庫故障連帶中斷原刊物。

## 失敗與恢復

每次 Function 最長 240 秒，每次一個模型步驟或一版的兩份 PDF。原始 schema 回覆、用量與完成 checkpoints 儲存在工作文件。模型請求開始前先記錄 active step 和共用預算預留；用量／結果未知時停止為 `USAGE_RECONCILIATION_REQUIRED`，不自動重發可能已計費的請求。這種情況需要核對供應商後處理，不能按重新整理當作免費重試。

新部署若改變 Prompt／程度設定／執行契約，舊工作會停下來，不把成功 checkpoint 當成不同輸入的結果。已成功的普通分步工作可繼續；產生重大複核問題時保留紀錄並等待修訂。

## 驗證

- `pnpm test`：含工作持久化、單篇隔離、整期分步、冪等、租約、未知用量停止、並行預算和發布快照測試。
- `pnpm build`：含 Vercel Chromium、字體、Prompt 及配圖追蹤。
- `node scripts/qa-web-editorial.mjs`：本機 synthetic Supabase／模型，實際 Next.js、瀏覽器、授權、儲存、Chromium PDF 與發布讀回；不消耗真實模型額度。需要先 build，Chrome 可用 `DD_CHROME` 指定。
- 證據寫入忽略 Git 的 `output/web-editorial/`。這些測試不冒充正式 Supabase 或 NVIDIA 的 live 驗收。

`NotoSansTC-Print.ttf` 是原 OFL 字體的列印副本，只移除 538 個重複部首 cmap 別名，保留原中文字形，以修正 PDF ToUnicode；原字體及授權不變。Vercel 不執行 Python。

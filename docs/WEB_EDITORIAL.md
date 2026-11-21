# 網頁編輯室 — 2026-11-20

日常入口為 `/editor`。輸入 Vercel 的 `EDITOR_ACTION_SECRET` 解鎖後，可直接在網站製作整期、重新生成單篇、查看 log、下載 PDF 和核准發布。NVIDIA 請求由 Vercel Node.js Functions 執行，不派送 GitHub Actions。

## 即時 pool 與每日自動出刊

2026-11-20 新增來源／題材勾選清單與 8–10 篇 shortlist。BBC、The Guardian、Smithsonian、Global Voices 預設啟用，NASA 可選。RSS 只用來發現題材；選中後另讀正文，擷取有來源短引文支持的原創事實底稿，不保存整篇原文。已出刊十四天內的相同 URL 會排除；LLM 以趣味、重要性、生活關聯、時效與多樣性排序。來源故障會列明，候選不足八篇不捏造清單。

勾選四篇即寫入 `news:plan:<日期>`；「LLM 幫我選四篇」採用這輪 LLM 推薦。手動生成使用 Vercel Workflow，關閉頁面後仍繼續來源核對、十二篇寫稿與複核、十二張分齡概念圖、六份 PDF，最後留待人工審閱。新圖片存在私有 `issue-files/web-assets`，使用有授權檢查的穩定資產路徑，PDF 在後端載入同一份圖片。

使用者最新授權每日台北時間 09:00 截止選題、12:00 自動出刊。Vercel Cron 每天 UTC 16:00（台北午夜）以 `CRON_SECRET` 啟動當天的 durable workflow；提前啟動避開 Hobby cron 的小時級抖動，Workflow 等到 09:00 才鎖定選題並準備，通過檢查後等到 12:00 發布。若已手選四篇或已有手動生成工作就沿用；未選滿時即時更新來源與 shortlist，再由 LLM 選四篇。正式新刊的 12 張配圖皆須為 AI 生成，不以分類圖示代替放行。暫時性圖片錯誤最多三輪、有預算上限並保留每次請求，兩輪間由 durable workflow 等待，不占住瀏覽器。PDF 使用獨立的私有渲染函式，避免與圖片處理共享同一批原生記憶體。重複排程以日期 Hook token 去重七天，不另開生成。時間與啟用狀態可在編輯室調整，新的時間自下一次排程生效。

選題鎖定後可先暫停自動出刊再換題；發布前會再次檢查啟用狀態、版本指紋、來源敏感度、十二份複核、分級詞彙與 PDF。公開讀取同時接受 `web_manual`、`scheduled_auto`。同一天已有刊物時，自動排程不覆蓋。網路、預算或複核失敗會保留紀錄與上期刊物，不以假新聞補出刊。自動模式讀不到文章或短引文核對失敗時，從同輪 shortlist 改選，已計費回覆保留；未知模型用量不自動重發。

圖片日上限預設 16 次，包含失敗與未知結果；沿用現有 NVIDIA key，或指定 `NVIDIA_IMAGE_API_KEY`。生圖失敗明確標示並保留分類圖示。文字仍使用共用日預算，不因排程增加上限。`CRON_SECRET` 僅供伺服器，不能用於編輯室登入。

PDF 依使用者原模板保留 10mm 外緣、6mm 中央留白、各欄獨立的上下短線與有底色的頁尾；沒有左右分隔線。依使用者再次確認，圖片保留標題下方滿欄、正文接在圖片下方。

測試 `node scripts/qa-news-workflow.mjs` 使用合成 RSS／模型／資料庫，但實際跑 Next.js、瀏覽器、Workflow 與 Chromium：勾選、關閉頁面、背景十二篇與十二張圖、六 PDF、重複排程去重、自動發布與公開圖片／PDF。證據在忽略 Git 的 `output/news-workflow/`。

2026-11-20 更新：四篇 PDF 使用雙欄四區、細線分隔的緊湊報紙版面，三版現有樣本彩色／省墨均可一頁排完。移除固定兩頁的檢查，仍檢查全文、字體、圖片、溢出與實際頁數；內容較長時自然續頁，不裁掉正文或縮到最低字級以下。

`/review` 現在會在管理員解鎖後列出資料庫中的網頁工作。工作頁的「審核與放行」持續可見，列明 PDF／稿件是否已完成；全部檢查通過並勾選人工審核後，使用「審核通過並發布」。歷史待審稿也有「審核通過並放行」：登入並確認審核後，沿用正文、重製 PDF，再寫入網頁發布快照，不重跑模型。

失敗後可「只重試 PDF」，保留模型結果；稿件檢查停止且用量已確認時可繼續生成。未知用量／仍有 active step 的工作維持停止，不自動重發。原始成功 checkpoint 若被新版修訂取代，會以 archived key 保留。

若模型列出的詞不在正文，或沿用了較低程度的學習詞，四篇流程會另做一次詞彙修訂：只允許選取正文實際出現、未跨版重複的字形，保持正文不變，再做事實與程度複核。這個模型步驟同樣儲存並計入預算，不以程式捏造詞義或偷偷刪掉檢查。

## 操作

新 Supabase 第一次使用：開啟 `/editor/setup`，輸入既有編輯室管理密碼，檢查連接目標與空庫狀態，再勾選確認初始化。SQL 在 Vercel 後端使用 Marketplace 的 PostgreSQL 設定執行，不需要匯出 Sensitive 值。初始化核對 API／PostgreSQL 指向同一專案，使用驗證憑證的 TLS；整批 SQL 在交易中執行，非空專案會拒絕，失敗回滾。既有庫不會被清除。若需要自訂 CA，可設定 `SUPABASE_DB_CA`。

1. 在編輯室選四篇已核對來源，確認刊物日期與編輯方向，按「生成三版刊物」。目前來源庫仍是已核對的底稿，不宣稱已完成自動新聞發現；過期、未來或缺少核對的來源會被拒絕。
   同一事件沿用已核准的照片與分齡插畫並凍結配圖快照；沒有核准配圖的故事使用明確標示的原創分類圖示。本次不增加自動生圖請求。
2. 網頁持續呼叫後端，每次最多接續三個模型步驟；批次經過 30 秒後不再開始下一步，保留 Function 收尾時間。每個成功回應仍立即存進 Supabase。離開頁面會在目前批次完成後暫停，重新開啟同一份工作可繼續。工作狀態不依賴瀏覽器記憶體或 Vercel 暫存檔案。log 會列出已完成寫稿、複核與單字修訂的次數／紀錄秒數（含儲存）。
3. 三版完成後，由 Vercel 的無頭 Chromium 製作彩色／省墨共六份 PDF，沿用報紙 HTML、字體與自然分頁檢查，存進私有 `issue-files` bucket。
4. 審閱三版、來源、模型評語與 PDF。可直接重新生成特定故事的一個或三個程度；其他文章保留。新版本另外儲存。
5. 勾選已審閱後發布。後端重新驗證版本指紋、十二份 review、分級選字和六份 PDF 的 SHA-256／頁數，再原子寫入發布快照。首頁與日曆立即從資料庫讀回；不需要重新部署才能換刊。

## 必要變數

- 新 Vercel Marketplace 資源使用 `DAILY_DIGEST_SUPABASE_URL` 與 `DAILY_DIGEST_SUPABASE_SECRET_KEY`，這一組優先；初始化亦只使用同前綴的 PostgreSQL 連線。未設定這一組時才讀取 `SUPABASE_URL`／`SUPABASE_SECRET_KEY`，最後沿用 legacy `NEXT_PUBLIC_SUPABASE_URL`／`SUPABASE_SERVICE_ROLE_KEY`。每一組必須完整，避免新舊專案的設定混用。
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

每次 Function 最長 240 秒，每次最多三個模型步驟或一版的兩份 PDF。原始 schema 回覆、用量與完成 checkpoints 儲存在工作文件。模型請求開始前先記錄 active step 和共用預算預留；用量／結果未知時停止為 `USAGE_RECONCILIATION_REQUIRED`，不自動重發可能已計費的請求。這種情況需要核對供應商後處理，不能按重新整理當作免費重試。

2026-11-20 後續修復：每一份 PDF 使用獨立的 Chromium persistent/default context，避免 single-process 引擎的新 incognito context 關閉問題；只對明確的 browser-closed/crashed 錯誤重啟一次。彩色、墨水 PDF 各自上傳後立即 checkpoint，重試只補缺少檔案，不重新呼叫模型。四個 story 框平均分配整張 A4 的可用高度，空白留在各自框內。此處的 persistent context 是 Playwright 產生的全新暫存 profile，沒有沿用使用者瀏覽器。

新部署若改變 Prompt／程度設定／執行契約，舊工作會停下來，不把成功 checkpoint 當成不同輸入的結果。已成功的普通分步工作可繼續；產生重大複核問題時保留紀錄並等待修訂。

## 驗證

- `pnpm test`：含工作持久化、單篇隔離、整期分步、冪等、租約、未知用量停止、並行預算和發布快照測試。
- `pnpm build`：含 Vercel Chromium、字體、Prompt 及配圖追蹤。
- `node scripts/qa-web-editorial.mjs`：本機 synthetic Supabase／模型，實際 Next.js、瀏覽器、授權、儲存、Chromium PDF 與發布讀回；不消耗真實模型額度。需要先 build，Chrome 可用 `DD_CHROME` 指定。
- 證據寫入忽略 Git 的 `output/web-editorial/`。這些測試不冒充正式 Supabase 或 NVIDIA 的 live 驗收。

`NotoSansTC-Print.ttf` 是原 OFL 字體的列印副本，只移除 538 個重複部首 cmap 別名，保留原中文字形，以修正 PDF ToUnicode；原字體及授權不變。Vercel 不執行 Python。

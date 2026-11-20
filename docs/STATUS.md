# 網頁生成與資料庫發刊（2026-11-20）

新增 `/editor`：直接呼叫 Vercel 後端 NVIDIA、分步儲存 Supabase、製作六份 Chromium PDF、網頁人工核准與資料庫讀回首頁／日曆。單篇重生不再要求使用者複製 JSON 到 GitHub。沿用既有 `app_settings` 的受 RLS 保護命名空間與 `issue-files` 私有 bucket；沒有重跑初始化或放開匿名寫入。來源仍需已核對底稿，未宣稱自動新聞發現或每日自動出刊完成。工程、恢復限制及驗證入口見 [WEB_EDITORIAL.md](WEB_EDITORIAL.md)。正式部署和外部服務實測結果另外記錄，不能以本機 synthetic 測試代替。

以下為歷史紀錄，涉及 GitHub 手動發刊的敘述已由網頁編輯室取代。

# Git 版本化發刊與日曆（2026-11-19）

本輪新增 `/review` 公開審查入口、GitHub 權限核准、不可變稿件版本、發布前圖片與 PDF 驗證，以及 `/issues` 的已出刊月曆和日期清單。原試閱保留於試閱存檔，不冒充已出刊。今天新聞採 NASA 與 UNESCO 的四個官方來源項目，三種程度各四篇，保留分齡配圖和使用者已選字體。來源、修訂與執行者記錄保存在版本化 catalog。

本次依使用者要求由開發代理試發，核准方法明確記為 `developer_test_release`，不宣稱使用者已人工審閱。後續管理者在 GitHub 的核准工作流勾選已審閱後才記錄人工核准。操作見 [PUBLICATION_FLOW.md](PUBLICATION_FLOW.md)。

目前使用 Git 與 Vercel 發刊，尚未寫入 Supabase、未開啟每日排程或郵件通知。沒有將這次網站換刊當作資料庫、私有 Storage 或自動來源流程的驗收。

以下為先前紀錄。

# 最新閱讀入口修正（2026-11-19）

使用者已提供 Vercel 網址：https://daily-digest-wine-two.vercel.app/ 。原先首頁導向登入，與先不做帳號的決定不符；本輪將預設入口改為直接閱讀四篇真實來源試閱刊。三版、已讀進度、單篇與六份 PDF 不需 Supabase 或 API 憑證。`/login` 返回閱讀，管理頁不提供入口，管理 API 在唯讀模式拒絕操作。沒有啟用每日生成或正式發布。資料來源與檔案雜湊見 `content/reading-preview/`。

以下為先前里程碑與證據的歷史紀錄；涉及舊八篇 DEMO、登入或「尚無 Vercel URL」的敘述不代表目前閱讀入口。

# 實作狀態 — 2026-11-19（台北）

最新驗證：[2026-11-19 四篇制試產已完成](FOUR_STORY_TRIAL_RESULT.md)。12 篇實際 NVIDIA 稿件、7 項有原稿雜湊的編輯校稿、6 張分齡成圖、官方 NIST 照片、六份兩頁 PDF 與九組版面已驗證，私人預覽已更新。保留一項輕微選字建議；未寫正式資料庫、未正式出刊、未啟用每日執行。第 15 份增量升級及拒絕錯誤／重跑的隔離資料庫測試通過，尚未套用雲端。模型預設已同步本次實測 Ultra；費率仍未知。


最新規格：每日一刊四篇，同事件 A1／A2／B1，共十二篇正文；六份兩頁 PDF，每頁兩篇。新稿單字依程度和學習價值另選，跨版重複會擋下；生成插畫分小學明亮簡單／國中清爽適中／高中成熟水彩，照片維持真實原貌。單次 daily 排程為台北 06:17，正式啟用旗標仍關閉。四篇底稿來源試跑和生成結果以 [FOUR_STORY_TRIAL.md](FOUR_STORY_TRIAL.md) 及各次 artifact 為準；未寫入正式資料庫、未發布。15 份 migration 已在隔離 PostgreSQL 驗證，包含四篇 staging／十二 review／六 PDF／核准；使用者雲端專案尚未套用第 15 份。

先前主線：NVIDIA 文字與圖片均有實際成功回應。FLUX 3（50 步）咖啡店／公園水彩已驗證；閱讀頁新增「自動選圖」，有授權資料照就不生成，三版共用；45 組版面與 12 份圖片 PDF 驗證通過。Google Nano Banana 免費層配額為 0，使用者要求暫停 Google 測試。完整證據及尚未接通的每日圖片額度／私有 Storage 見 PROVIDER_PREVIEW_STATUS.md。不是全期真實新聞出刊完成。

較早圖片測試紀錄（後續已接通 NVIDIA）：私人 DEMO 的 `/images/` 提供同一篇三版生成稿的水彩 AI 插畫／CC0 資料照／原創分類圖示比較，27 組響應版面與 12 份兩頁圖片 PDF 驗證通過。水彩圖由 ChatGPT 圖片工具實際生成；NVIDIA 圖片 API 三次試驗尚無可用圖（含一次 HTTP 200 全黑圖，已否決並加上拒收）。未接自動圖片排程／私有 Storage，未出刊；見 IMAGE_PREVIEW_RESULT.md。

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

已有 NVIDIA 實際 API 比較稿；尚無已確認費率／真實計費金額、真實新聞的 Supabase 儲存／發布、Vercel URL，或家庭試用紀錄。所有樣刊仍是 DEMO；測試資料庫中的「published」只存在於銷毀式合成測試，不算 A18。

使用者已指定先用 NVIDIA Nemotron；不再等待供應商選擇。待設定項目集中於 SETUP.md。沒有建立其他網站或購買方案。

表頭第二輪：DEMO 閱讀頁新增「表頭試字」入口；mastheads.html 提供八款新候選與上一輪兩款對照，可切換紙色、字重、字寬與字距。選定前不改動閱讀頁或 PDF 預設。四尺寸、十款字型實際載入、選擇記憶與儲存拒絕檢查通過。

Supabase 接續：已取得 https://bqoqzxharmatphcqwldo.supabase.co ，未帶憑證的 Auth health 請求回傳 401。已準備 14 份 migration 的單一交易初始化 SQL，並在隔離 PostgreSQL 驗證初始化、重跑拒絕、保留既有資料及中途失敗回滾。證據：output/supabase-bootstrap-verification.json；操作見 SUPABASE_SETUP.md。尚未對此雲端專案套用 SQL，也沒有取得任何 API key。

表頭選定：使用者指定國小 H（Playfair Display）、國中 C（Old Standard TT Bold），高中不改。國小採 H 預設 600／92%／-0.030em；國中沿用當前試字頁的 700／70%／-0.070em。已同步閱讀網頁與六份兩頁 PDF，正文與署名保留原設計。最新設定以 MASTHEADS.md 的 Current approved selection 為準。

使用者已回報 Supabase schema_initialized（14 migrations、0 issues、0 members、review、live_enabled=false）。家長帳號暫緩；先用新 NVIDIA Preview 手動流程驗證 Nemotron 三版生成，不依賴 Supabase／登入，不寫庫、不發布。使用者已回報設定 GitHub Secret LLM_API_KEY；實際模型回應、用量與產物仍須以該次 API run 為準。

NVIDIA 首次實際 API 試驗：run 44306426113 已讀到 Secret，但舊 Nano 型號回傳 MODEL_HTTP_410，尚未生成稿件。已依官方即時 catalog 與現行 model page 改為 Nemotron 3.5 Lightning 30B-A3B，保留失敗 report；新的生成結果另行驗證。

NVIDIA 實際比較已完成：run 44309609059，Nemotron 3.5 Lightning，A1/A2/B1 為 41／61／111 字，7 次模型回應，10300 input／1090 output tokens，cost_unknown。三版皆通過該次機械檢查及模型複核；開發檢視另發現國中詞義「蠔粉」誤譯，已在展示稿校正為「蠟筆」並保留原始回應及修訂紀錄。這是單篇虛構比較稿，沒有整期 PDF、不寫資料庫、不出刊。詳見 NVIDIA_PREVIEW_RESULT.md。

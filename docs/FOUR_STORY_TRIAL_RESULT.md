# 2026-11-19 四篇制試產結果

已完成一份可閱讀、可下載的**真實來源待審稿**，不是正式出刊或無人值守排程驗收。

- [私人三版比較頁](https://dayday-digest-demo.kelvin820.chatgpt.site/daily-trial/compare.html)
- [小學版閱讀](https://dayday-digest-demo.kelvin820.chatgpt.site/daily-trial/elementary.html)／[國中版](https://dayday-digest-demo.kelvin820.chatgpt.site/daily-trial/junior.html)／[高中版](https://dayday-digest-demo.kelvin820.chatgpt.site/daily-trial/senior.html)
- [六份兩頁 PDF ZIP](https://dayday-digest-demo.kelvin820.chatgpt.site/daily-trial/DayDay_2026-11-19_six_review_PDFs.zip)
- [實際 Actions run 44479976061](https://github.com/kelvin820/DailyDigest/actions/runs/44479976061)：success；artifact `daily-production-trial`，ID 14508046402。

## 本期產出

四個事件來自 NASA、NIST、Library of Congress、NOAA NCEI；三個頁面在 runner 直接讀取，圖書館使用當天已人工讀取核對、附時間與雜湊的官方摘錄快照。來源 URL、日期精度與證據保留在 `source-evidence.json`、`facts.json`。

| 版本 | 目標 | 四篇英文字數 |
|---|---|---|
| 小學 | A1 | 43／55／55／50 |
| 國中 | A2 | 69／64／68／64 |
| 高中 | B1 | 98／93／96／91 |

十二篇皆有實際 NVIDIA 寫稿與複核回應；同事件三版的兩個學習詞彙各自挑選，拒絕簡單大小寫／複數重複，不使用 Cambridge 詞庫。CEFR 是提示詞與模型審查的寫作目標，仍需讀者試讀校準。

文字最初使用 Lightning 30B，實測多次未符合句長／選字限制，改用 `nvidia/nemotron-3-ultra-550b-a55b`。這輪包含七份有原稿雜湊約束的編輯校稿，再由模型複核；原始 checkpoint、改字紀錄與舊版校稿紀錄分開保存。不能將本輪描述為全自動一次生成成功。

國中氣候稿的 `comparison` 留有一項**輕微選字建議**。其事實、難度及兒童適讀檢查通過，但原始 `publish_recommendation: revise` 沒有改成 pass；比較頁與 report 明列待人工校準，正式發布 gate 仍拒絕它。

## 圖片與 PDF

- NIST 採官方署名照片，三版保留同一張照片的真實內容；NOAA 的 Canva 首圖未直接取用。
- 望遠鏡、閱讀桌兩個題材，各有小學／國中／高中不同的 NVIDIA FLUX 3（50 steps）概念插畫，共六張成圖。小學明亮、大形狀；國中適度細節、淺色背景；高中成熟水彩。
- 初次六個生圖請求之後，一張國中插畫因意外含有標題而被視覺檢查否決，明確增加一次人工修正請求；共七個圖片請求，保留拒收紀錄。這是本次手動試產額度，尚非跨 runner 的正式每日圖片預算驗收。
- 六份彩色／省墨 PDF，皆 A4 兩頁、每頁兩篇；全文、詞義、嵌入字體、最低正文字級與溢出檢查通過。修正輸出字型副本的重複部首映射，`民` 等文字可正確複製；沒有弱化全文檢查，也沒有修改原始字型檔。
- 三版 × 375／768／1440，共九組閱讀版面及切版、圖片、單字差異檢查通過；私人站實際套件的六份 PDF／ZIP／舊樣刊導覽也在本機逐一驗證。

本期累計文字 API 63 次、127781 tokens，含先前失敗、格式修復與校稿複核；這不是單次成功 run 的請求數。單價未確認，`cost_unknown`，不宣稱免費或已驗證低於 USD 2。

## 正式環境仍待完成

`databaseWritten=false`、`published=false`，正式每日排程沒有啟用。網站是 owner-only 的私人試產預覽，不是已完成的 Vercel 正式部署。

Supabase 已回報初始化十四份 migration；第十五份的本地隔離 PostgreSQL、四篇 staging／十二 review／六 PDF／核准交易，以及增量升級防呆已通過，但未對使用者雲端專案執行。其餘憑證、Vercel 權限、來源核准、私有圖片／PDF Storage 與端到端驗收集中在 [SETUP.md](SETUP.md)。家長帳號與會員流程維持延後。

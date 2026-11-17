# 來源稽核 — 2026-11-18（台北）

本輪以實際 worker 的安全 HTTPS transport 讀取 robots、條款與候選 RSS；使用繼承的代理／CA，CONNECT 與直接連線均釘選已驗證公網 IP，redirect 重新檢查 allowlist。沒有下載新聞 API、產生 LLM 改寫或發布。

| 來源／項目 | 最後成功時間（台北） | 結果 |
|---|---|---|
| NASA · https://www.nasa.gov/nasa-brand-center/images-and-media/ | 2026-11-18T06:14:45+08:00 | fetched |
| NASA · https://www.nasa.gov/feed/ | 2026-11-18T06:14:46+08:00 | fetched；近 7 日且通過當前 URL allowlist 的 metadata 6 則 |
| NOAA · https://www.noaa.gov/office-education/outreach-communication/faq | 2026-11-18T06:14:48+08:00 | fetched |
| BBC discovery · https://www.bbc.co.uk/usingthebbc/terms/ | 2026-11-18T06:14:50+08:00 | fetched |
| BBC discovery · https://feeds.bbci.co.uk/news/rss.xml | 2026-11-18T06:14:51+08:00 | fetched；近 7 日且通過當前 URL allowlist 的 metadata 0 則 |

完整 final URL、MIME、大小、SHA256 與 robots 結果見 source-audit-evidence.json。沒有把全文或圖片保存到 Git。

## 使用範圍與未完成項目

- NASA：RSS 可讀；media guidelines 已讀取。但個別內容與第三方圖片例外未由管理者核准，rewrite_policy 仍 unknown。
- NOAA：候選條款頁可讀；尚未建立可用 feed 與正文／權利驗收。
- BBC：RSS 僅作發現線索；全文政策 restricted，不將 RSS 當免費 AI 改寫授權。當前 feed 的文章 hostname 尚未擴充到 article_domains，所以稽核候選數為 0，不是宣稱沒有新聞。
- 其他來源（USGS、Smithsonian 等）仍是規格候選，沒有宣稱已接通。

config/sources.json 全部維持 pending / disabled。啟用自動改寫須人工填 reviewed_at、robots 審查、rewrite_policy=allowed，以及可永久保存必要摘錄的 evidence_policy=permanent_excerpt；robots 會在每次實際 URL 抓取時重新評估。來源不能由 LLM 自行授權。

來源不足八則、分類不足、證據不足或事件重複時，worker 停 needs_attention，上一期繼續可讀。可改由管理者提供經確認的八則底稿，或擴充經核准來源；不買新聞 API、不捏造補稿。配額例外的管理操作目前尚未提供，採嚴格停稿。

## 保存與配圖

候選全文只在處理記憶體使用，不落入 durable checkpoint；永久 fact bundle 只保留通過原文比對、且政策允許的必要摘錄。現階段圖片一律原創分類圖示；網路照片、AI 圖與 private image transport 尚未驗收。圖片 API 不影響離線工作。

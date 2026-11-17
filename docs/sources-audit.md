# 來源稽核 — 2026-11-17
目前沒有任何來源通過本地擷取→改寫→真實出版驗收。來源登錄全部 pending/disabled，不能當成每日八則穩定供稿。

| 來源 | 已核對 | 本地最後成功擷取 | 可使用範圍／下一步 |
|---|---|---|---|
| NASA | 官網有 RSS 頁及 media guidelines；不保證每項素材無第三方權利 | 無（尚未實測成功） | 單篇內容及圖片權利仍需人工核對；政策未啟用 |
| NOAA | 候選 URL 留存 | 無 | 檢查實際 feed、使用條款、credit |
| BBC | 僅作 RSS discovery 候選 | 無 | 全文及圖片預設不可投入改寫，不能把 RSS 存在當授權 |
| Smithsonian / USGS / Guardian | 規格候選，尚未接線 | 無 | 逐站稽核，不能推論整站授權 |

參考：
- https://www.nasa.gov/rss-feeds/
- https://www.nasa.gov/nasa-brand-center/images-and-media/
- https://science.nasa.gov/earth/faq/
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

本地 npm registry 請求 ENOTFOUND，環境網路有限；瀏覽搜尋可查官方說明不等於 worker 已有網路及抓取權利。
下一次來源 audit 必須記錄：timestamp、HTTP 狀態、實際最終 URL、robots／條款檢查、全文抽取品質、權利例外、證據保存期限。
不足八則時 needs_attention，保留上一期；可由管理者提供已讀且權利核准的 fact bundle 檔給 draft CLI。


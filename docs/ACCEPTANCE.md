# 驗收證據 — 2026-11-18

| 項目 | 本輪證據與限制 |
|---|---|
| A01 三版同八則 | fixture 與 intake/editorial 合約通過；live 待測 |
| A02 Prompt / 無 Cambridge | 版本化 A1/A2/B1 Prompt；沒有詞庫依賴；Nemotron mock 通過，live 難度校準未測 |
| A03/A04 長度／詞彙 | 24 篇通過，完整詞匹配與重複詞彙拒絕；writer 不合格最多兩次 revise |
| A05 證據／不確定性 | claim allowlist、verbatim evidence、來源衝突／review 合約有測試；真實新聞事實驗收未完成 |
| A06 圖片 | 八則原創圖示及 credit，沒有偽稱現場照；真實照片未驗收 |
| A07/A08 PDF／同步 | 六份 DEMO，每份兩頁；8 篇 headline/body/詞彙可抽取，嵌入字體，body 最低字級，DOM 邊界；共享 payload，無 PDF 另改文字 |
| A09 即讀 | Next.js build 的 DEMO 瀏覽／API／下載無外部模型請求；live 日誌待驗 |
| A10 歷史 | DEMO 與路由驗證；DB published immutability／current revision 本機測試；雲端待驗 |
| A11/A12 恢復／冪等 | durable cache、JSONB 排序、過期 lease、跨 runner 用量、未知帳務、六個並行 runner 只有一個取得 lease、兩個並行 reservation 只有一個過額度 |
| A13 權限 | 本機 PostgreSQL 真正執行 RLS／RPC，anonymous/reader/inactive/admin 矩陣；Supabase Auth/PostgREST/Storage 端到端仍未測 |
| A14/A15 裝置／已讀 | 正式 Next.js 375/768/1440；手動已讀、reload、profile、版別、重置；storage 拒絕有暫存與提示。跨真實帳戶待測 |
| A16 時區 | UTC→Taipei 跨日單元通過；固定 fixture 日期不冒充今天 |
| A17 成本 | reserve/settle/unknown usage 與並行日上限通過；實際 NVIDIA 費率與帳單未測 |
| A18 Live | 未通過，沒有真實出刊；RSS 網路稽核、mock、測試 DB 的合成 publication 都不算 |

證據：output/app-verification.json、db-verification.json、qa-report.json、pdf-verification.json、source-audit.json，以及 app-screenshots/、screenshots/。單元與 provider 合約共 34 項。

尚無學習成效證明，CEFR 是初始寫作目標。PDF 使用 NFKC 正規化 fi/ff 連字，Type3 字體須有 CharProcs 與 ToUnicode；不是整頁圖片。所有合成測試均與 production 隔離。

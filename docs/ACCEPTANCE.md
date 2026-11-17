# 驗收證據
2026-11-17。所有內容為 DEMO，不得當成 A18 live 通過。

| 項目 | 結果 |
|---|---|
| A01 同八則三版 | 離線通過 |
| A02 Prompt / 無詞庫 | 程式與版本化 Prompt 已備；模型校準未測 |
| A03 長度 | 24/24 通過 |
| A04 詞彙 | 24/24 各兩詞且正文出現 |
| A05 真實事實 | 未測；只有虛構 fixture |
| A06 視覺 | 八則原創分類圖示；非事件照片 |
| A07 六份兩頁 PDF | 通過頁數、DOM 邊界、全文抽取與字體檢查 |
| A08 Web/PDF 一致 | 同 payload / shared renderer；全文比對通過 |
| A09 即讀 | 離線讀取無模型呼叫；production 未測 |
| A10 歷史 | 單一 DEMO 期刊可用；DB 歷史未測 |
| A11 失敗 | cached step failure/retry 單元通過；全管線故障恢復未測 |
| A12 冪等 | pure cache 單元通過；DB lease/atomic publication 未測 |
| A13 權限 | SQL 與 server checks 已寫；真實角色矩陣未測 |
| A14 裝置 | Chrome 375/768/1440 無水平溢位；面板 Escape 測試通過 |
| A15 進度 | 手動標記、reload、local profile 分離通過；live account 切換未測 |
| A16 時區 | UTC 22:17 對應下一台北日通過 |
| A17 成本 | 預留額度拒絕／call cap 單元通過；真實費率、跨 runner 記帳未測 |
| A18 Live | 未通過、未執行 |

PDF 字體包含 Chromium 將 variable font 轉為內嵌 Type3 CharProcs 的情況；保有 ToUnicode，正文可擷取。抽取比較使用 NFKC 將 fi/ff 連字還原。這不是把整頁截成圖片。
詳細機器證據：output/qa-report.json、output/pdf-verification.json。
視覺證據：output/screenshots。人工查看實際 PDF raster（Poppler）及手機截圖，沒有正文裁切。


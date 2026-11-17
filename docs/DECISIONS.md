# 實作決策
- 規格依據：完整 PRODUCT_SPEC.md，2026-11-17。
- 保留 Next.js / TypeScript、Supabase、GitHub Actions 與 Vercel 指定架構，沒有改成其他代管平台。
- CEFR 只用版本化 Prompt 控制；沒有 Cambridge 詞庫、逐字程度表或付費新聞 API。
- 預設 DEMO_MODE 必須明確為 true 才能讀 fixture；正式模式缺 Supabase 不退回假新聞。
- 初版同八則 fictional Maple Bay / school stories，沒有捏造真實人物或機構新聞。
- 自有 SVG 分類圖示為合法備援。沒有執行圖片 API，沒有使用不明權利的網路照片。
- M1 共用 lib/render.mjs 渲染正文與列印：每個輸入都 escape，來源連結限 HTTPS。React 包裝此受控 renderer；非任意 HTML。
- 離線 portable preview 用相同 JSON / renderer / CSS，以避免無法安裝 Next.js 阻擋視覺樣刊交付。它不是已驗證的 Next.js build。
- 正文字級小學 14pt、國中 12pt、高中 11pt；國中／高中採文字繞圖，兩頁仍容納全部原文。
- 保留 Noto Sans TC / Noto Serif TC 字體及內嵌授權資訊。Newsreader.ttf 是目前的相容檔名，實際字體為 Noto Serif TC，非 Newsreader 字型。
- 發布交易不允許 DEMO、三版不齊、PDF 缺失或 hash/revision 不一致。published revision 不可就地覆寫。
- PostgreSQL RLS 與 RPC 尚待真實 Supabase 驗證，不能以 SQL 檔存在當成權限驗收成功。
- 本機無法連 registry.npmjs.org（ENOTFOUND），且 Chromium loopback 請求被禁止；使用 file URL 檢查離線樣刊。未要求擴大權限或購買服務。
- 不偽造 lockfile：目前沒有可解析依賴樹，須連網安裝後產生並改 CI 為 frozen lockfile。


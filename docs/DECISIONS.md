# 實作決策

## 2026-11-18 接續更新（以下更新優先於底部原交付紀錄）

- 保留使用者交付的 M1 設計與原始樣刊，沒有重建產品；原始 zip、public 與 output 另留比對。
- 本輪已能正常安裝套件，固定 Node 24 / pnpm 11.25.0，產生實際 lockfile；frozen install、正式 build、lint/typecheck 已驗證。底部「無 lockfile／無法安裝」只描述原交付當時。
- 使用者已選 NVIDIA Nemotron。採官方 Nano 型號為初始預設、非串流、關閉 thinking、Prompt JSON + Zod；獨立 reviewer request。沒有真實 key 或 live 呼叫。
- JSON hash 改為遞迴固定欄位順序，避免 JSONB 重排讓有效快取失效。模型步驟包括完整 Prompt 與 provider 參數，不含秘密。
- 現行分級／主題集中在 config/edition-settings.mjs；新稿保存 readingRules 快照，舊 1.0 稿使用固定 v1Rules，避免調門檻後歷史期刊無法讀取。PDF 程度取 payload.targetCefr，不用現在的預設值冒充舊稿程度。
- 背景狀態／lease／日額度移到 DB RPC；unknown usage 保留預留額度，跨 runner 不重置。修訂產生新 revision，繼承證據但清除 review/PDF，人工文字不被 writer 蓋掉。
- PDF 改走只綁 localhost 的 renderer，等待字體、解碼圖片後檢查；Python 驗證實際 PDF 全文、詞彙、嵌字與字級才設通過。production 模板 1.1 加本期 HTTPS 連結；原 DEMO 保留 1.0。
- 來源 transport 使用已驗證 IP pinning，並支援繼承代理／CA；robots 實際路徑驗證。已成功做 read-only source audit，但來源權利仍全 pending。
- 原始全文只在記憶體處理；intake 只將政策允許且原文存在的必要摘錄保存在 fact bundle。原創圖示保留為目前唯一已驗證圖片路徑。
- auto 以三個不同已發布日的家庭試讀記錄為門檻；不能傳入虛構 trial_count。workflow 仍需 live 驗收開關，初始維持關閉。
- 本機 PostgreSQL 使用 network=none 的臨時容器與合成資料，終了移除；不代替 Supabase Auth/PostgREST/Storage 的真實驗收。

## 原 M1 交付紀錄（2026-11-17）
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


# 實作狀態 — 2026-11-17
這是 M1 可審閱交付及 M2–M4 原始碼起點，**不是 M0–M5 全部完成**。

| 里程碑 | 已完成並驗證 | 尚未完成／阻礙 |
|---|---|---|
| M0 | 規格副本、24 篇 fixture、共用字數／句長、離線測試、專案與 CI 設定 | npm registry DNS 不可達；Next.js 依賴安裝、lockfile、typecheck/lint/build 尚未通過 |
| M1 | 三版離線閱讀、詞彙、已讀、三位本機讀者、歷史樣刊、放大閱讀；六份兩頁 PDF；響應式及 PDF DOM 溢位檢查 | Next.js 路由版尚未 build；視覺需使用者／孩子試讀回饋 |
| M2 | migration、RLS、私有 bucket、發布 RPC、登入／reader API／管理頁原始碼 | Supabase 未配置；角色／交易實測、受邀 email 設定、管理頁編輯及核准操作 UI、修訂 endpoint 尚待完成 |
| M3 | Prompt、schema、OpenAI-compatible adapter 草稿、同 fact bundle 改寫／review／最多兩次 revise、可選手動 approved facts → draft CLI | 尚未確認實際供應商；adapter 未 live 測試；來源自動 discover/fetch/select/facts 未串接；來源供稿權限與數量不足；draft 上傳 DB/storage 尚未串接 |
| M4 | cron 範本、手動 dispatch API、lease RPC、input hash cache、有限重試、成本煞車單元測試 | 本機 cache 未接 durable DB step store；budget 未跨工作續跑持久化；workflow preflight 故意封鎖；force_new_revision/resume 尚未串接；不得啟用自動花費 |
| M5 | 部署／操作文件、驗收記錄、完整交付壓縮包 | 未部署 Vercel；沒有正式 URL；沒有真實出刊或三期家庭試用 |

## 已實測
- node --test tests/core.test.mjs：15/15 通過。
- 24 篇 body：小學 46–50 字、國中 77–83 字、高中 108–119 字；符合句長與兩詞彙出現規則。
- Chrome headless 離線檔案：三版 × 375/768/1440 px，無頁面水平溢位。
- 手動已讀→重新整理保留；讀者切換隔離；放大面板與 Escape 關閉。
- 六份 PDF：每份兩頁、八個 article 格無溢位。詳 output/qa-report.json。
- PDF 抽取與字體驗證詳 output/pdf-verification.json（使用 Unicode NFKC 正規化印刷連字 fi/ff）。
- 沒有執行真實 LLM 請求；沒有真實費用紀錄、來源成功抓取時間或發布紀錄。

## 使用者集中設定清單
1. GitHub 新 repo 或指定目標 repo；Vercel 新專案。尚未自行建立或變更任何其他網站。
2. Supabase project URL、publishable key；service-role 只放 server/runner secrets；管理員 email。
3. LLM 供應商、writer/reviewer 型號、是否支援 OpenAI-compatible JSON；API key 只放 secrets，**勿貼聊天**。
4. 確認 input/output token 價格、每日預算；預設 2 USD 只是煞車，非實測成本。
5. 確認台北 06:17 開始／07:17 補跑與預設人工 review。
6. 圖片 API 可省略：目前自有圖示不需憑證。
7. 恢復能安裝 npm 套件的開發環境；先安裝、生成 lockfile、完成正式 app 檢查。
設定憑證不是唯一剩餘工作：上表列出的 pipeline 串接與權限整合測試仍需施工。

## 下一步施工順序
1. 連網環境跑 pnpm install，產生 lockfile；修復 typecheck/lint/build。
2. 在全新 Supabase 套用 migrations；跑 anonymous/reader/admin 矩陣與原子發布並行測試。
3. 完成 admin revise/approve UI、durable job store、來源擷取與 PDF upload 整合。
4. 依實際 provider 接一個 adapter，人工核對來源權利；跑第一期 live E2E。
5. 解除 preflight 前證明 timeout/resume/lease/budget 不重複花費，才啟用排程。
6. Vercel preview、正式部署、三期家庭試用；最後考慮 auto。


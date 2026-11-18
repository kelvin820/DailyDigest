# 先生成、後接家長登入

使用者目前只有開發者本人使用，已指定先看 NVIDIA Nemotron 的生成結果。
家長帳號、邀請、登入與密碼設定延後，不是試生成的前置條件。

架構分工：Vercel 預計運行正式 Next.js 網站；GitHub Actions 負責寫稿、
複核與 PDF；Supabase 保存已核准的內容與私人檔案。現有 Sites 網址是
私人靜態 DEMO，尚未部署正式 Vercel 網站。因此模型 key 放在呼叫模型的
runner，網站不必持有 NVIDIA key。

## 唯一必要憑證

在 kelvin820/DailyDigest 的 Settings → Secrets and variables → Actions →
**Secrets** 新增 repository secret `LLM_API_KEY`，值為 NVIDIA API key。
也接受既有的 repository secret NVIDIA_API_KEY，workflow 會映射為 LLM_API_KEY。
不要放在 Variables，不要提交 Git，也不要貼聊天。

`NVIDIA Preview` workflow 只允許從預設分支手動執行；不會因 push、PR 或
排程自動呼叫模型。金鑰只交給憑證檢查與生成兩個步驟，依賴安裝步驟不取得它。

## 生成與檢查

Workflow 執行 `node --import tsx scripts/nvidia-preview.ts`。本機可用忽略的
`.env.local` 搭配 `node --env-file-if-exists=.env.local --import tsx scripts/nvidia-preview.ts`。

- 真正使用 NvidiaProvider 與 `nvidia/nemotron-3-nano-30b-a3b`，沒有 fixture provider fallback。
- 以同一批八則自有虛構底稿，分別寫 A1/A2/B1，使用既有 Prompt、字數／句長／詞彙檢查與獨立複核。
- 成功後輸出 24 篇、三版閱讀 HTML、六份驗證過的兩頁 PDF、複核、checkpoint 與 usage report。
- 若失敗，保留已收到的實際草稿及錯誤代碼；不以原本示範文章補足，也不提供未通過驗證的 PDF 下載。
- 全程不寫 Supabase、不啟用排程、不發布任何真實期刊；輸出仍標明虛構 DEMO。

每次 preview 最多 80 次請求、180000 tokens；已知單價時另檢查 2 USD 估計額度。
單價未知時為 cost_unknown，**不是已保證低於 2 USD 或免費**。逾時等未確認用量會保留
usage_unknown，重跑前先核對 NVIDIA 用量；每次手動新 run 都是新的試生成，不跨 run 恢復。

## 讀取結果

下載該 Actions run 的 `nemotron-preview` artifact，從其中 run 目錄開啟
index.html／elementary.html，或由開發流程檢查後放入私人 DEMO 的獨立預覽路徑。
`report.json` 分開記錄 API 嘗試、帶 usage 的回應、未確認用量、稿件與 PDF 狀態。
只有 `apiGenerationSucceeded: true` 且 `pdfVerified: true` 才代表完整試生成通過；
`published`、`databaseWritten` 永遠為 false。

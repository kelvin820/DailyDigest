# 集中設定清單

使用者已決定先用 NVIDIA Nemotron。以下項目仍未取得；金鑰勿貼聊天。

GitHub 原始碼已備份至 https://github.com/kelvin820/DailyDigest ，遠端主分支為 main；runner secrets／variables 與正式出刊設定仍待完成。

| 設定 | 放置位置 | 目的 |
|---|---|---|
| NVIDIA API key → LLM_API_KEY | GitHub production environment secret；本機用忽略的 .env.local | 模型生成／複核 |
| writer/reviewer 模型 | runner variables；初始均為 nvidia/nemotron-3-nano-30b-a3b | 可分別調整；目前僅 mock 合約通過 |
| Supabase project URL、publishable key、管理者 email | Vercel；在 Supabase 邀請家長並設定 site_members | 私人登入與 reader/admin |
| SUPABASE_SERVICE_ROLE_KEY | 只放 runner secret | 背景 DB／private Storage；讀者網站不需要它 |
| Vercel 專案、實際 HTTPS APP_URL | 各平台與 runner variables | 部署及 PDF 本期網址 |
| DAILY_BUDGET_USD、MAX_MODEL_CALLS、MAX_MODEL_TOKENS | runner；預設 2 / 100 / 200000 | 不是實測成本承諾；0 USD 暫停模型呼叫 |
| input/output 每百萬 tokens 單價 | runner variables，可先留空 | 未知時 cost_unknown，仍保留 calls/tokens 限額；模型不同費率不可填一組假定價格 |
| 各來源實際改寫、證據摘錄保存政策 | 人工核對 config/sources.json、sources-audit.md | 目前全 pending；RSS 可讀不等於全文授權 |
| GITHUB_DISPATCH_TOKEN（可選） | 只放 Vercel server secret，限目標 repo Actions write | 編輯室派送；缺少則禁用，GitHub 仍可手動 |

圖片 API 不需要先提供，目前用原創圖示。台北 06:17 主排程、07:17 補跑、人工 review 延用既定預設，不需再選一次。

配置順序：新 Supabase 開發專案 → migrations／邀請與權限實測 → Vercel DEMO preview／私人 live 設定 → 一期人工底稿或已核准來源的 live 出刊 → 人工核對內容／PDF／用量 → GitHub 啟用排程。三期家庭試用後才切 auto。

不要先設 DD_PIPELINE_ACCEPTED=true 再用失敗的排程代替工程驗收。它是 live 驗收完成後的操作開關，預設保持 false。

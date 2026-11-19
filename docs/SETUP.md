# 集中設定清單

目前先使用 NVIDIA，家長帳號與會員流程延後。四篇 × 三版的真實來源待審稿、六份兩頁 PDF 與分齡插畫已完成，詳見 [本輪結果](FOUR_STORY_TRIAL_RESULT.md)。私人預覽不依賴家長登入，沒有寫入正式資料庫或正式出刊。

## 已有設定

- GitHub Repository Secret `LLM_API_KEY` 已實際驗證文字與 FLUX 3 圖片，不需重設或貼在聊天。
- `GEMINI_API_KEY` 已存在；Google 免費圖片配額為零，依使用者要求維持停測，不需現在開計費。
- Supabase URL：https://bqoqzxharmatphcqwldo.supabase.co 。使用者已回報十四份 migration、0 期刊、0 成員、review／live_enabled=false；本次沒有對雲端資料庫執行操作。
- 原始碼已備份在 https://github.com/kelvin820/DailyDigest 的 main。現行預設文字 writer／reviewer 統一為本次實測的 `nvidia/nemotron-3-ultra-550b-a55b`；價格未知不等於免費。

## 正式環境需要你設定的項目

| 項目 | 放置位置／處理方式 | 用途 |
|---|---|---|
| 第十五份增量 migration | 在原 Supabase 專案升級，保留原資料；不要重跑新專案初始化 SQL | 四篇刊物／舊八篇共存、十二份 review 與六份 PDF 的 DB 檢查 |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub runner Secret，勿放 `NEXT_PUBLIC_*` 或聊天 | 後台 DB 與 private Storage；現有 LLM Secret 不需搬動 |
| `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel 環境設定；正式編輯室先只建立你自己的管理員身分 | 真實 Auth／PostgREST／RLS 驗收；不先邀請家長 |
| Vercel 專案及 HTTPS `APP_URL` | 在 Vercel 匯入 kelvin820/DailyDigest，再設定 Vercel／runner 的實際網址 | 目前連接的 CKM team 建專案回 403，尚無 Vercel 部署；私人 Sites 預覽不受影響 |
| `WRITER_MODEL`／`REVIEWER_MODEL` | runner Variables；未設定時使用 Ultra 預設；若仍留 Lightning override 請更新 | 保持與本輪驗證模型一致 |
| 單價與額度 | `LLM_INPUT_USD_PER_MILLION`／`LLM_OUTPUT_USD_PER_MILLION`、`DAILY_BUDGET_USD`／`MAX_MODEL_CALLS`／`MAX_MODEL_TOKENS` | 預設 2／100／200000；未知價格只提供 calls/tokens 上限，不是實測美元保證 |
| 來源政策、私有圖片與 PDF Storage | 核准 config/sources.json 的真實來源；完成私有上傳、讀取與角色測試 | 目前完整試產採人工核對底稿；正式來源 intake、圖片傳輸仍需驗收 |
| `GITHUB_DISPATCH_TOKEN`（可選） | Vercel server Secret，限此 repo Actions write | 網頁編輯室派送；沒有它仍可用 GitHub 手動操作 |

增量 SQL 可離線產生，內含十四份來源 checksum、review 模式、無執行中工作與防止重跑的交易守衛：

```sh
node scripts/build-supabase-upgrade.mjs https://bqoqzxharmatphcqwldo.supabase.co
# output/supabase-upgrade-15.sql
```

這支產生器不連線 Supabase。請先確認 SQL Editor 選中上述專案，再執行整份升級檔；若原安裝不是先前的 SQL-Editor bootstrap，history 守衛會拒絕，不要移除守衛硬跑。新的空專案另用 `build-supabase-bootstrap.mjs`，不能拿初始化檔覆蓋既有專案。

## 啟用順序

先審閱本次成品與待校準詞彙 → Supabase 增量升級與私有 Storage／角色驗收 → Vercel 與真實 API／下載驗收 → 真實來源的每日試跑與花費核對 → 才設定 `DD_PIPELINE_ACCEPTED=true`。

每日只保留台北 06:17 一個排程；自動正式發布仍關閉，初期使用 review 模式。不要先打開驗收旗標來代替工程驗證。三期實際試讀及其餘發布條件仍需完成，沒有將本輪待審試產當成已出刊或家庭試讀成功。

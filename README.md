# DayDay Daily Digest
Four stories. Every day. Your level.

網頁編輯室：`/editor`。可勾選新聞來源與題材 pool，由 LLM 整理 8–10 篇 shortlist，手選四篇或採用 LLM 組合，再於背景製作三種程度、分齡插圖與六份 PDF。每日台北時間 08:00 自動出刊：提前 30 分鐘採用已儲存的四篇，未選滿時由 LLM 選題。Vercel Workflow 在關閉網頁後仍持續執行，稿件與發布紀錄存進 Supabase。操作與儲存方式見 [WEB_EDITORIAL](docs/WEB_EDITORIAL.md)。`EDITOR_ACTION_SECRET` 用於管理員解鎖；讀者不需登入。

Vercel：<https://daily-digest-wine-two.vercel.app/>。預設直接閱讀最新已發布的四則新聞，可切換小學／國中／高中三版、記錄已讀及下載六份 PDF。**一般訪客不需要登入或 API key。手動生成先進審查頁；每日自動出刊必須通過來源、十二份模型複核、詞彙與六份 PDF 檢查，才更新首頁。**

三版表頭維持使用者已選的字體；單字依程度另選，AI 插畫依讀者年齡調整。當前內容來自 NVIDIA 生成、編輯校稿與模型複核，沒有在開啟網頁時重新生成或寫入資料庫。原始模型回覆與審閱紀錄保留在私有 artifact；可閱讀稿件、原始比較稿、核准圖片與 PDF 隨網站部署，狀態明確區分待審與已發布。來源及待審狀態見 [reading preview](content/reading-preview/README.md)，製作結果見 [FOUR_STORY_TRIAL_RESULT](docs/FOUR_STORY_TRIAL_RESULT.md)。

## 審查與發刊

[出刊審查](https://daily-digest-wine-two.vercel.app/review) · [已出刊日曆](https://daily-digest-wine-two.vercel.app/issues) · [操作流程](docs/PUBLICATION_FLOW.md)

預設 `READING_MODE=public`：首頁讀取最新已發布刊物；第一期發布前保留原試閱刊。編輯室管理密碼控制手動發布；使用者亦已授權每日自動選題與發布。已出刊日曆只標示確實有發布紀錄的日期。

日常出刊透過 Vercel 後端與 Supabase，不使用 GitHub Actions 或重新部署來換刊。Git catalog 保留歷史存檔與資料庫不可用時的閱讀備援。

## 本機閱讀

Node 24、pnpm 11.25.0：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
# http://127.0.0.1:3000
```

不設定環境變數時，直接載入最新已發布的四篇刊物；第一期發布前保留原試閱刊。圖片與 PDF 已包含在 repo，無須另外生成。需要自訂時可複製 `.env.example`；`READING_MODE=public`、`DEMO_MODE=false`，不啟用生成或發布。家長帳號延後，`/login` 會回到閱讀頁。Supabase 與每日正式出刊的設定集中在 [SETUP](docs/SETUP.md)。

以下為歷史八篇虛構樣刊的離線工具，與目前四篇試閱入口分開：

不安裝 Next.js 也能生成離線閱讀預覽：
```sh
node scripts/offline.mjs
node scripts/serve-offline.mjs
# http://127.0.0.1:4173
```
public/fonts 必須與原始碼放在一起；預覽腳本會複製字體。PDF 自帶嵌入字體。

## 驗證與 PDF
```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:preview               # 先 pnpm build；四篇、無登入的閱讀／API／圖片／PDF／寫入拒絕
pnpm test:db                    # Docker；自建 network=none 的臨時 PostgreSQL，結束自動移除
pip install -r requirements-pdf.txt
pnpm exec playwright install chromium
pnpm demo
pnpm demo:qa                   # 六份 PDF、全文、字體、字級、版面與三尺寸預覽
pnpm test:app                  # 先 pnpm build；正式 Next.js 的 DEMO 全流程
```
已有系統 Chromium 時，可設定 `DD_CHROME=/usr/bin/chromium`。PDF 使用隨機 localhost port，不對外暴露 draft。驗證證據在 output/；不進 Git。

## NVIDIA Nemotron 與出刊
目前預設 `nvidia/nemotron-3.5-lightning-30b-a3b`，writer/reviewer 各自獨立請求，可用環境變數改型號。NVIDIA 合約與價格邊界見 [NVIDIA](docs/NVIDIA.md)。金鑰只設定於 runner secrets／本機忽略檔，不貼聊天。

`pnpm pipeline` 預設只建立 DEMO；LIVE_GENERATION_ENABLED=true 後才使用 durable worker。來源尚待核准，因此不能只補 key 就視為出刊驗收。人工補稿可用 `APPROVED_FACTS_FILE` 與 `pnpm stage:approved`，格式見 [APPROVED_FACTS](docs/APPROVED_FACTS.md)。兩條路徑共用 lease、每日預算、review、六 PDF 與原子發布門檻。

每日 workflow 保持 DD_PIPELINE_ACCEPTED 關閉，直到一次真實出刊與部署驗收。auto 還需要三個不同日期的實際已發布期刊，由管理者記錄家庭試讀；DEMO 不計入。

CEFR 只由 Prompt 控制並複核，不接 Cambridge 詞庫、不買新聞 API。現階段八則均使用原創圖示；沒有把分類圖示當作事件照片。詳 [部署](docs/DEPLOYMENT.md)、[操作](docs/OPERATIONS.md)、[來源稽核](docs/sources-audit.md)。

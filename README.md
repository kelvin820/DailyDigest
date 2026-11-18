# DayDay Daily Digest
Four stories. Every day. Your level.

接續原 M1 成果開發，保留已選定的三版表頭與舊八篇虛構樣刊。新刊改為每日四篇，三版依程度另選學習單字，生成插畫採分齡風格。NVIDIA 文字／圖片已有實際 API 測試，四篇真實來源試產以 Actions artifact 的 report 為準；**試產不代表正式發布，也未完成 Vercel／Supabase Storage 的出刊驗收。** 四篇試產操作見 [FOUR_STORY_TRIAL](docs/FOUR_STORY_TRIAL.md)。完整進度見 [STATUS](docs/STATUS.md)，設定需求集中在 [SETUP](docs/SETUP.md)。

## 本機閱讀
本輪分為 source、review 兩個 ZIP；在同一位置解壓，便會同時具有程式與 output/preview 的六份樣刊 PDF。只從 Git 取得原始碼時，先依下面的 PDF 步驟生成樣刊，下載按鈕才有檔案可讀。

Node 24、pnpm 11.25.0（packageManager 已固定）：
```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm build
pnpm start
# http://127.0.0.1:3000
```
Windows 使用 `Copy-Item .env.example .env.local`。預設 DEMO_MODE=true、LIVE_GENERATION_ENABLED=false；fixture 日期不會冒充當天。

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

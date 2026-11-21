# Daily Digest 開發待辦與接手順序

更新日期：2026 年 11 月 21 日。先閱讀本檔，再讀 [流程架構](ARCHITECTURE.md)。本檔的雲端數字是最後保存的結果，接手時應重新查核，不能直接宣稱目前仍是相同狀態。

## 接手時先確認

- 工作目錄：`C:\Users\User\Documents\ChatGPT\Daily Digest`。
- Repository：`https://github.com/kelvin820/DailyDigest`，分支 `main`。
- 本次品牌整理前已 fetch 遠端，HEAD 與 `origin/main` 同為 `5e47a6a129a4ffb4f48e354e0c05b08f96664936`；本次提交另包含 Logo 與既有修改，最新版本請查 `git log -1`。
- 正式網站：`https://daily-digest-wine-two.vercel.app`。
- Vercel scope：`ckm13`；專案 `daily-digest`，ID `prj_AoSHUcgOzOtlJ1M1Nv47DfKKZ9XY`。
- 最後實際查核為 Ready 的部署版本是 `dc3a69f`。`5e47a6a` 已推送，但部署狀態尚未重新核實。
- 先執行 `git status --short --branch`、`git diff`。不要用 reset、checkout 或直接 pull 覆蓋本機修改。

接手前原有三個未提交修改：`lib/media/illustration-sheet.ts`、`tests/illustration-sheet.test.ts`、`docs/OPERATIONS.md`。它們落實使用者最新要求：圖樣相近或相同，不因此拒絕或重新生圖。本次提交一併納入上述修改、交接文件、品牌資產與原始碼驗證／備份工具；品牌版面與恢復方式見 [BRANDING.md](BRANDING.md)。

## 使用者已確定的方向

- 生成、儲存和出刊在 Vercel 後端與 Supabase 執行；GitHub 用於原始碼及部署，不作日常生成引擎。
- 每日台北時間 **09:00 截止選題，12:00 出刊**。已手選四篇就保留；未選滿則更新即時來源，讓 LLM 選四篇。
- 編輯室可勾選來源與題材，取得 8–10 篇 shortlist，再選四篇。NASA 是選用來源，不是整份報紙的主來源。
- 正式新聞為四個故事、國小／國中／高中三版，合計十二份分級稿與十二張 AI 插畫。
- 保留分齡 prompt。**圖片太相近不修改、不重生**；只做檔案、尺寸、空白及可用裁切等必要檢查。
- 一次生成四張小圖的拼圖方案可繼續研究，現有樣張保留，不為強求風格差異而額外花生圖請求。
- 成人黑白新聞插畫是試樣，尚未要求新增正式第四版。
- PDF 依原模板維持四格、頁尾、整頁紙色、中央留白；無左右分隔線，上下以兩段線分隔。圖片在標題下方滿欄，正文從圖下開始。
- 不為固定兩頁而縮字或截斷正文。原模板已複製到 [reference](reference/DD_2026-11-17_junior_r1_color.pdf)。

## 已完成和仍未完成

| 項目 | 狀態 |
| --- | --- |
| 即時來源 pool、LLM shortlist、四篇手選與自動選題 | 已有實作及整合測試 |
| Vercel durable workflow、Supabase checkpoint、關頁續跑 | 已有實作及實際執行 |
| 三版稿件、模型複核、十二張 AI 圖片的正式新聞門檻 | 已有實作；不要把圖示算作 AI 成功 |
| 六份 PDF、人工審核發布、排程發布 | 已有實作；有六個歷史出刊日完成公開下載核對 |
| HTTP 422 的 800 字元 prompt 限制 | 已依實際 NIM 回覆修正 |
| HTTP 429 限流自動等待 | `dc3a69f`，已在真實工作與合成服務整合測試驗證 |
| PDF 瀏覽器關閉的重試、同程序序列化、正式輸出續跑 | 已有實作；成功檔案以 receipt 重用 |
| 最多三順位生圖切換 | 已接入可設定機制；目前主要是 NVIDIA adapter，正式新模型名單仍待使用者測試結果 |
| 拼圖生圖及四份裁圖 | 管理員試樣功能可用；尚未接到正式新聞生成 |
| 風格相近不拒絕 | 本次提交納入，測試通過；正式部署狀態須另查 |
| 同 topic 三難度文字一次生成 | 尚未實作、尚未實測，只完成設計方向 |
| 七期歷史試刊 | **未全部完成：六期已發布，11 月 18 日還缺七張圖** |

## P0 完成七期試刊與部署本機修正

### 1 先核對雲端與執行權限

- [ ] 核對 Vercel 正在使用的部署 SHA、環境變數名稱及 Supabase 綁定。
- [ ] 核對 `git diff` 中的圖片相近接受規則，連同本次交接文件一起保留。
- [ ] 確認上一輪自動審批配額問題是否已解除。當時提示 12:59 後再試；被拒的 Vercel 查詢沒有執行，後續補圖調額及續跑也沒有執行。不要改用其他通道繞過審批。
- [ ] 如需維護 token，建立新的短期 `EDITOR_SETUP_TOKEN`，設定後重新部署；不要使用已過期 token，也不要把金鑰貼到聊天或文件。

應用的永久 `CRON_SECRET` 必須保留。Vercel CLI 在這個 workspace 曾已登入，優先檢查現有授權，不要要求使用者重貼已設定的 LLM 或資料庫金鑰。若 connector 回 404，先確認帳號與 `ckm13` scope，不要重建專案或資料庫。

### 2 補齊 11 月 18 日

最後保存的 campaign 是 `c3984407-c834-46b6-a08b-927373fdd649`，範圍固定為 **2026-11-13 至 2026-11-19**，不能隨今日日期滑動。

| 日期 | 最近保存結果 |
| --- | --- |
| 11 月 13、14、15、16、17、19 日 | 各已發布十二張 AI 插圖及六份正式 PDF |
| 11 月 18 日 | 十二篇稿件完成、33 次成功文字模型回覆；五張 AI 圖片完成，七張因 `IMAGE_BUDGET_EXCEEDED` 未完成；尚無正式 PDF／release |

11 月 18 日 job：`19d5211c-2b45-4c39-bb0b-33268e29996f`。

- [ ] 先讀這個 job、campaign 與圖像帳本，確認是否已有後續執行結果。
- [ ] 若仍是相同狀態，使用已寫好的管理動作 `POST /api/editorial/setup`，將本次圖像請求上限從 112 擴充至 124，保留原帳本，只補缺圖。
- [ ] 使用有效編輯室 session 或短期 setup token，以及正確 `Origin`；下例不是可匿名執行的 API。

```json
{
  "action": "extend-backfill-images",
  "id": "19d5211c-2b45-4c39-bb0b-33268e29996f",
  "extraRequests": 12,
  "notes": "依使用者已授權完成七期且每期十二張 AI 插畫的要求，保留原 112 次圖像嘗試紀錄，最多新增十二次補圖嘗試，只補剩餘七張；LLM 與一般每日上限不變。"
}
```

- [ ] 調額成功後對 `/api/editorial/backfill` 送出 `{ "action": "resume", "id": "c3984407-c834-46b6-a08b-927373fdd649" }`。
- [ ] 跟到 job 的十二張圖全數 `done`、六份 PDF 完成、release 寫入及 campaign `complete`；不要只啟動就報告成功。

`extend-backfill-images` 及其稽核／上限保護在 `5e47a6a`。**上次沒有真的調到 124**。`.runtime/extend-last-images.mjs` 當時也沒有建立，不能假設有這個腳本。可用結構化 API 直接操作，或先建立不含金鑰的輔助腳本。

### 3 完成公開端驗證

- [ ] 每期讀回三版公開 payload，確認每版四篇、正式刊標記、來源日期不晚於各期截止。
- [ ] 解碼每期十二張公開 AI 圖片，下載六份正式 PDF，比對 SHA、全文、詞彙、字體、頁尾與紙色。
- [ ] 七期齊全才合併產生 `output/backfill/verification.json`；目標為 84 份分級稿、84 張 AI 插圖、42 份 PDF。
- [ ] 如實保留跨期來源重複。已確認同一篇日食來源出現在 11 月 14 日第 2 篇、15 日第 4 篇；目前六期為 24 個故事位置、23 個不同來源故事。不要宣稱 28 個不同故事，或改 ID 假造去重。

本機和原始碼備份保留以下輔助檔，均不含實際金鑰：

```powershell
node .runtime/backfill-control.mjs status
node .runtime/verify-backfill.mjs 2026-11-18
node .runtime/check-completed-pdfs.mjs 2026-11-18
node .runtime/merge-week-proof.mjs
```

先更新 campaign status，再執行驗證。`verify-backfill.mjs` 請逐日使用；它的舊整週模式要求跨期全不重複，會因上述既有來源重複失敗。`merge-week-proof.mjs` 會如實列出故事位置、不同來源數及重複日期。PDF 輔助程式的 Python 路徑需依目前 bundled runtime 調整；其依賴與 `.runtime/python-deps` 不是應用程式部署依賴。

### 4 核對今天出刊與清理

- [ ] 重新核對 2026-11-21 的日常排程，不要把歷史試刊的失敗誤認為當天排程也失敗。
- [ ] 最近保存的當天 job 為 `779960ae-f78f-4b35-8d2c-1574fb1b044b`，workflow 為 `wrun_41M7XVQDMC0GMSVPGV1KNAM7DV`；十二圖與六份草稿 PDF 已完成，文字用量仍為 34 次，workflow 當時正在等 12:00。尚未觀察到午間實際放行。
- [ ] 保留原手選／自選、job ID 及付費結果。若要恢復已停止的日常流程，用 `resume-daily`，不要用 `reopen-selection` 清掉選題與 job。
- [ ] 所有維護完成後，移除 Vercel 的 `EDITOR_SETUP_TOKEN` 並重新部署，確認舊 token 被拒、公開閱讀正常，再刪除本機臨時憑證檔。

最後一個 setup token 設定的到期時間是 2026-11-21 10:45:52 台北時間；該變數尚未完成移除。**不要刪除正式 `CRON_SECRET`、`EDITOR_ACTION_SECRET` 或 Supabase 憑證。**

## P1 文字三版批次生成

- [ ] 以已完成的一題作為對照，只新增一次三版批次實測，不把所有付費稿件重做。
- [ ] 每 topic 一次產出 `elementary`、`junior`、`senior` 三份結構化 JSON，沿用相同 verified fact bundle。
- [ ] 保留每版獨立的事實覆蓋、CEFR、詞彙存在及同題六個詞彙不重複的驗證。
- [ ] 評估複核也一次處理同題三版；失敗時只補修該版，另外兩版保留。
- [ ] 新批次流程使用獨立 contract／checkpoint，保留原始三版回覆與 provider request ID。同一請求的 usage 只記一次，不能複製到三版後重複累加。
- [ ] 比較實際耗時、輸入／輸出 token、請求數、429 次數、格式失敗與分級品質，再決定新刊預設。舊 job 繼續用原快照和快取。

四題的寫稿可由 12 次降為 4 次；複核若也合併，由 12 次降為 4 次。寫稿加複核的基本請求為 24 → 8，加上四次來源核對為 28 → 12；選題、補修、失敗請求另計。這是設計估算，不是已測得的加速倍數；總輸出字量仍相近。

主要修改點：`lib/pipeline/editorial.ts`、`lib/schemas/editorial.ts`、`lib/providers/text.ts`、`lib/editorial/web-jobs.ts`、`prompts/` 和相關測試。

## P1 生圖順位與拼圖接入

- [ ] 等使用者回報測試通過的模型／平台與順位。不要把「三順位骨架已完成」寫成三家服務已接好。
- [ ] 視名單實作各服務 adapter、驗證請求格式、錯誤碼與實際可用性，金鑰設定在 Vercel，不貼聊天。
- [ ] 驗證第一順位拒絕時第二順位能成功、第三順位不會多呼叫；401／額度問題要停止，不能盲目花費。
- [ ] 維持每次嘗試獨立的預算與 prompt／model／error 紀錄，不把逾時、422 與內容過濾混為一談。
- [ ] 拼圖接入以檔案與可用裁切檢查為準；**相近或相同圖樣不得觸發重生**。現有樣張不再修改。
- [ ] 如要將一次回圖分給三個正式程度，須保存一次原始回圖及三版資產關聯；上傳或存檔重試只重用既有圖，不再次叫模型。
- [ ] 成人黑白圖保留試樣狀態；正式第四版需另行定義文字程度、版面及發布規則。

樣張與拒絕 prompt 在 `output/illustration-study/`，含 `DayDay-illustration-model-test.zip`。六份舊 `CONTENT_FILTERED` prompt 是由快照重建；Microsoft 的 HTTP 422 prompt 則有實際請求紀錄，原因是該端點 800 字元限制。

## P2 補足邊界情境

- [ ] 檢查歷史補跑或跨日未完成工作也能去重；目前即時 pool 主要排除已發布來源 URL。
- [ ] 檢查舊底稿與單篇重生是否全面符合 AI 圖片政策；目前正式 AI 圖片門檻明確套在 `input.kind === 'news'`。
- [ ] 重現同日新修訂沿用舊 job 的 AI 資產時，公開圖片路由是否因 `release.jobId === asset.jobId` 而誤拒；修改前先驗證，不要改動既有已核准文章。
- [ ] 檢查 workflow 工作在人工按重試後的 hook／run ID 是否正確更新，避免拿到已結束的舊 run。
- [ ] 在編輯室清楚區分生成、等待限流、稿圖完成、等待 12:00 與需要處理，不把暫停畫面更新誤說成停止後端。

## 本機驗證與原始碼備份

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm exec next build --webpack
node scripts/qa-pdf-runtime-trace.mjs
```

Windows 本機完整瀏覽器驗證可沿用系統 Chrome：

```powershell
$env:DD_CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe'
node scripts/qa-news-workflow.mjs
```

`qa-news-workflow` 使用真實 Next.js、瀏覽器、Workflow 與 PDF，但 RSS、模型及 Supabase 是合成服務；不能把這份結果當作真實七期出刊證據。Windows 的 Turbopack／暫存目錄曾遇 EPERM；先區分沙箱權限與應用程式錯誤，不要因此改動業務邏輯。

本次交接重新執行全套 **126 項測試，全部通過**。Git 物件檢查通過，原始碼檢查涵蓋全部 507 個已追蹤檔案，以及本機新增文件／工具；未發現缺檔、LFS 指標占位或遺失的 catalog 靜態資產。完整 SHA 清單記錄在 `output/handoff/source-verification.json`，壓縮檔會逐檔回讀核對；可重跑：

```powershell
node scripts/verify-source-tree.mjs
pwsh -File scripts/create-source-archive.ps1
```

備份包含本機工作樹、交接文件、字體、靜態資產、原模板，以及白名單維護腳本。品牌版備份另外包含 `handoff/DailyDigest-history.bundle` 保存全部本機 refs 可到達的 Git 歷史；它不含實際金鑰、`node_modules`、完整雲端資料庫或私有 Storage 備份。原有 `.runtime`／`output` 大多不進 Git；本機證據與原始碼備份須另外保留。

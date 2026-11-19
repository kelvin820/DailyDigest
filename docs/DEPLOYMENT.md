# Vercel 部署與驗收

原始碼：<https://github.com/kelvin820/DailyDigest>，production branch 為 `main`。
使用 Node 24、pnpm 11.25.0，Next.js 自動偵測，build command 為 `pnpm build`。
不要指定 static export 或覆蓋其他專案。

## 目前狀態

四篇 × 三版的真實來源試閱稿及六份兩頁 PDF 已完成；原始稿件、模型審閱與編輯紀錄保留在私有產物中。這不代表已正式出刊。閱讀頁只顯示必要的試閱狀態；試字工具已移至 `devtools/mastheads/`，不隨網站公開。

使用者已匯入專案並提供 <https://daily-digest-wine-two.vercel.app/>。原部署因沿用會員保護而導向 `/login`；現已改為預設四篇唯讀試閱，不需要帳號或憑證。Git push 後使用該網址驗收，不需要再建立另一個專案。現有 Vercel 連接只能看到 CKM team，查不到此部署；不要因此把已存在的網站當作未部署，或變更其他 team 專案。

`READING_MODE` 未設定或設為 `public` 時讀取版本化發刊紀錄，無刊物時保留原試閱；顯式 `preview` 只用於固定試閱回歸測試，兩者都直接閱讀；`/login` 及編輯室頁面回到首頁，管理 API 拒絕變更。三版 JSON、七張核准圖片及其 print rendition、六份 PDF 隨原始碼部署；沒有原始模型回覆或被否決圖片。這不是自動生成、資料庫寫入或正式出刊。

## 網站與 runner 設定

集中設定與既有憑證見 [SETUP.md](SETUP.md)。不要在 repo、聊天或建置記錄貼 key。

- Vercel：匯入上述 repo，設定實際 HTTPS `APP_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。目前維持 `DEMO_MODE=false`、`READING_MODE=public`；下述資料庫設定僅供日後明確切換 `READING_MODE=published` 時使用。網站不直接呼叫 NVIDIA，不需要搬移既有 `LLM_API_KEY`。
- GitHub runner：沿用已驗證的 Repository Secret `LLM_API_KEY`；設定 `SUPABASE_SERVICE_ROLE_KEY`、實際網站 URL 與額度。初期維持 review、draft only，自動出刊關閉。
- 家長帳號延後。真實編輯室目前只需開發者自己的管理員身分；唯讀預覽不需要家長登入。
- 既有 Supabase 已初始化十四份 migration；只套用有守衛的第十五份增量，不能重跑空專案初始化。Private Storage 與角色權限須另行驗收。

`DEMO_MODE=true` 只會載入歷史八篇虛構樣刊，不能當作目前四篇真實來源試閱稿，也不能作為生成或正式出刊成功的證據。目前四篇試閱的 PDF 與核准圖片已包含於 `public/preview-issues/2026-11-19/`，不需要 cloud Storage；正式資料模式的私有檔案仍走原本 signed URL 流程。

## 驗收與啟用

先執行 typecheck、lint、unit tests、build，確認三版閱讀、手機版面、圖片及六份 PDF 下載；跨入真實資料模式後，再驗證 Supabase RLS、私有檔案與管理員操作。將實際部署 commit、環境、網址及結果記錄在交接文件。

第一期維持 review：核對來源、日期、分齡單字與插畫、六份 PDF、usage 和所有待修訂項目後，再核准發布。來源 intake 必須通過既有政策與 robots／摘錄授權檢查。

每日只保留台北 06:17 一個排程；通過真實端到端驗收前，不設定 `DD_PIPELINE_ACCEPTED=true`。三個不同日期的實際試讀及其餘發布條件完成後，才依原有守衛切換 auto。部署網站不會自動開啟出刊。


目前的手動發刊與日曆驗收，依 [PUBLICATION_FLOW.md](PUBLICATION_FLOW.md) 進行。新稿和已發布稿分開保存；首頁切換以 Vercel 成功部署新發布 commit 為準，不由頁面刷新觸發生成。

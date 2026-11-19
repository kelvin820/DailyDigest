# Vercel 部署與驗收

原始碼：<https://github.com/kelvin820/DailyDigest>，production branch 為 `main`。
使用 Node 24、pnpm 11.25.0，Next.js 自動偵測，build command 為 `pnpm build`。
不要指定 static export 或覆蓋其他專案。

## 目前狀態

四篇 × 三版的真實來源試閱稿及六份兩頁 PDF 已完成；原始稿件、模型審閱與編輯紀錄保留在私有產物中。這不代表已正式出刊。閱讀頁只顯示必要的試閱狀態；試字工具已移至 `devtools/mastheads/`，不隨網站公開。

目前 Vercel 連接可看到 CKM team（`team_Cu8JbGAp3KG9B0jOFWasVnZI`），但先前建立專案回覆 403，尚未有已驗證的 Vercel 網址。私人 Sites 預覽不等於 Vercel 部署。

## 網站與 runner 設定

集中設定與既有憑證見 [SETUP.md](SETUP.md)。不要在 repo、聊天或建置記錄貼 key。

- Vercel：匯入上述 repo，設定實際 HTTPS `APP_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。真實資料模式使用 `DEMO_MODE=false`。網站不直接呼叫 NVIDIA，不需要搬移既有 `LLM_API_KEY`。
- GitHub runner：沿用已驗證的 Repository Secret `LLM_API_KEY`；設定 `SUPABASE_SERVICE_ROLE_KEY`、實際網站 URL 與額度。初期維持 review、draft only，自動出刊關閉。
- 家長帳號延後。真實編輯室目前只需開發者自己的管理員身分；唯讀預覽不需要家長登入。
- 既有 Supabase 已初始化十四份 migration；只套用有守衛的第十五份增量，不能重跑空專案初始化。Private Storage 與角色權限須另行驗收。

`DEMO_MODE=true` 只會載入歷史八篇虛構樣刊，不能當作目前四篇真實來源試閱稿，也不能作為生成或正式出刊成功的證據。六份私有 PDF 與圖片不在 Git 原始碼中；部署前須確認所選資料模式和資產已備妥。

## 驗收與啟用

先執行 typecheck、lint、unit tests、build，確認三版閱讀、手機版面、圖片及六份 PDF 下載；跨入真實資料模式後，再驗證 Supabase RLS、私有檔案與管理員操作。將實際部署 commit、環境、網址及結果記錄在交接文件。

第一期維持 review：核對來源、日期、分齡單字與插畫、六份 PDF、usage 和所有待修訂項目後，再核准發布。來源 intake 必須通過既有政策與 robots／摘錄授權檢查。

每日只保留台北 06:17 一個排程；通過真實端到端驗收前，不設定 `DD_PIPELINE_ACCEPTED=true`。三個不同日期的實際試讀及其餘發布條件完成後，才依原有守衛切換 auto。部署網站不會自動開啟出刊。

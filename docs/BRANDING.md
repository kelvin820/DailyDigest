# DayDay Inc. 品牌整合

使用者提供的三款 Logo 原檔保存在 `docs/reference/logos/`，保留透明度、字形、配色與比例。網頁尺寸檔僅裁掉外圍透明留白並縮小，不重新繪製 Logo；執行 `node scripts/prepare-brand-assets.mjs` 可重建。

| 位置 | 素材 |
| --- | --- |
| 閱讀頁頂部、首頁連結 | 深色完整字標 |
| 閱讀頁深藍頁尾 | 白色完整字標 |
| 編輯室識別、網站圖示 | DD 圖標 |
| 四故事 PDF 報頭右上 | 深色完整字標；省墨版轉灰階 |

三個程度的 DAILY DIGEST 字體、標題下方滿欄圖、圖下文字、四格與原頁尾背景設定維持既有實作。已發布 PDF 為不可變檔案，需日後生成新 PDF 才會出現 Logo。

程式入口：`components/BrandLogo.tsx`、`components/Reader.tsx`、`app/editor/page.tsx`、`app/globals.css`、`lib/render.mjs`。Vercel 的獨立 PDF renderer 在 `lib/pdf/vercel.ts` 僅放行確定的本機 Logo 路徑，`next.config.ts` 將品牌檔納入 function tracing；離線 renderer `scripts/render.tsx` 會複製品牌檔。

驗證：完成 `pnpm build` 後，以 `DD_CHROME` 指向本機 Chromium，執行 `node --import tsx scripts/qa-branding.ts`。此檢查包含三程度 × 三種寬度、手機編輯室、favicon，以及經實際 backend renderer 產生的六份 PDF；不呼叫模型、雲端資料庫或上傳發布。結果存於 `output/branding-qa/`。

## 本機備份與恢復

先執行 `node scripts/verify-source-tree.mjs`，再執行 `./scripts/create-source-archive.ps1`。最新品牌版預設輸出 `output/handoff/DailyDigest-source-2026-11-21-branding.zip`，另有 SHA256 與檔案清單。壓縮檔內含完整來源、原始 Logo／PDF 參考，以及 `handoff/DailyDigest-history.bundle` 的全部本機 Git refs 可到達歷史。每個來源檔均核對 SHA256。

原始碼可直接解壓後 `pnpm install --frozen-lockfile`。需要 Git 歷史時，可先 `git clone handoff/DailyDigest-history.bundle restored-repo`，再依需求設定 origin。備份排除實際金鑰、node_modules、build cache、雲端資料庫與私有 Storage；部署環境需由現有 Vercel 專案取得。

2026-11-21 本機驗證結果：126 項測試全部通過；webpack production build（含 TypeScript）、修改檔 ESLint 與 PDF function tracing 通過；九種閱讀頁尺寸、手機編輯室與六份 PDF 實際渲染通過。已目視確認手機／桌面、彩色與省墨 PDF 的 Logo、四格與頁尾。上述 PDF 使用既有試閱稿，僅驗證品牌整合，不代表新的正式新聞出刊。
本次既有試閱稿頁數：小學與國中彩色／省墨各一頁，高中各兩頁；移除 Logo 後同稿仍為兩頁，已確認品牌整合沒有增加高中版頁數。

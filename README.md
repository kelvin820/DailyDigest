# DayDay Daily Digest
Eight stories. Every day. Your level.

先讀 [實作狀態](docs/STATUS.md)。目前提供可用的離線 DEMO 與六份兩頁 PDF；Next.js/Supabase/背景管線為未完成整合的原始碼，不能宣稱已真實出刊。

## 立即看樣刊
打開 output/preview/elementary.html（也可 junior.html / senior.html）。三版皆可切換、展開詞彙、手動記錄已讀、選本機讀者與下載旁邊的 PDF。
zip 解壓後保持資料夾結構，勿只搬單一 HTML。若瀏覽器不允許 file localStorage，用 Node 24：
```sh
node scripts/serve-offline.mjs
# http://127.0.0.1:4173
```

## 正式專案開發
```sh
pnpm install
# 首次成功後提交 pnpm-lock.yaml；CI 改為 --frozen-lockfile
cp .env.example .env.local
pnpm typecheck
pnpm lint
pnpm test
pnpm dev
```
Windows 請以 Copy-Item .env.example .env.local 複製。
本環境安裝因 npm registry DNS 受限未成功，尚無 lockfile；不可稱為 reproducible production build。

## 無外部套件也能測試
```sh
node --test tests/core.test.mjs
node scripts/check-fixtures.mjs
node scripts/offline.mjs
```

## PDF
安裝相容 Playwright/Chromium 後：
```sh
pnpm exec playwright install chromium
node scripts/offline.mjs
node scripts/qa-offline.cjs
python scripts/verify-pdfs.py
```
Python 需 pypdf。scripts/render.tsx 是 live payload 的渲染入口；CLI 的 textVerified/fontsEmbedded 預設 false，必須完成檢查才能發布。沒有下載時生成，沒有另改 PDF 文案。

## 重要邊界
- DEMO 永遠是虛構稿，不是當日新聞。沒有 Cambridge 詞庫、不購買新聞 API。
- .env.local / secrets 不進 Git，不放前端。production DEMO_MODE=false。
- 預設人工 review；排程 preflight 封鎖未整合管線，請先完成 STATUS 的工程項目。
- PDF / 圖片產物不進 Git；交付 zip 含樣刊供審閱，正式運作使用 private storage。
- fonts 使用 OFL 字體；詳 public/fonts 授權檔。
- 詳 docs/PRODUCT_SPEC.md、DEPLOYMENT.md、OPERATIONS.md、sources-audit.md。


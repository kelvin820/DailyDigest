# 本輪交接

工作目錄：本 source archive 的 dayday-daily-digest。本地分支 codex/continue-dayday，追蹤 origin/main；已推送備份至 https://github.com/kelvin820/DailyDigest 。私人靜態 DEMO 已發布至 https://dayday-digest-demo.kelvin820.chatgpt.site ，正式 Next.js／真實出刊尚未部署。

先讀 STATUS.md、SETUP.md。NVIDIA 已決定，初始 Nano 型號已配好；下一步是安全設定使用者現有 key 與 Supabase／Vercel，以及 GitHub runner 設定，再做真實出刊與三期試讀，不能把 DEMO 或合成 DB 測試算作成功。

保留原 M1 的主題、24 篇虛構稿與字體授權。原始 public、output 曾分包；本輪 source archive 重新包含 public，review archive 不重複字體，以免超過單檔 32 MiB。PDF 自帶字體；可直接審閱。

測試入口：pnpm typecheck/lint/test/build、node scripts/test-db.mjs、node scripts/qa-offline.cjs、node scripts/qa-print-failures.mjs、node scripts/qa-app.mjs。證據保存在 output；GitHub 初次備份的兩次 CI 均已通過並上傳 artifact。表頭字型試作見 MASTHEADS.md。

已知尚待工程／live 決策：來源個別權利與供稿多樣性、分類配額例外 UI、真正照片／private image transport、Supabase 服務層角色測試、NVIDIA 真實 JSON 與 CEFR 校準、價格與執行時間、部署 URL、三期家庭觀察。現有嚴格門檻會在這些條件不足時停稿，不假造成功。

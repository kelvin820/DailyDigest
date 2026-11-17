# 人工底稿入口

自動來源不足時，管理者可準備八則已讀、已確認使用範圍的事實底稿檔。這不是讓模型憑記憶補八篇新聞的捷徑。私有檔放 .runtime，不提交 Git。

每則符合 lib/schemas/editorial.ts 的 factSchema：story_id（英數、連字號、底線）、event_key、primary_category、content_kind、published_at、event_date（不明留 null）、sources、claims、uncertainties、sensitivity、is_demo=false。

每個 source 必須有 source_id、真實 HTTPS url、publisher、該來源自己的 published_at、retrieved_at、read_at、rights_reviewed=true、independence_group，以及允許保存的 evidence 摘錄。每個 claim 有 claim_id、text、supporting_source_ids、evidence_ref、status、must_keep；至少一項 core 為 must_keep。URL、時間與權利不可由 writer 捏造。

```sh
# 先按 SETUP.md 設定本機忽略檔或 runner secrets。
# 設 LIVE_GENERATION_ENABLED=true、DEMO_MODE=false、HTTPS APP_URL。
# APPROVED_FACTS_FILE 指向實際檔案，PUBLISH_MODE=review、DRAFT_ONLY=true。
pnpm stage:approved
```

CLI 先驗證資料，再取得 DB lease／每日額度。完成後保存八份 fact bundle、三版內容、review、六份 PDF 與 private Storage path，狀態 needs_review；尚未發布。管理頁核對後按核准，以交易切換 current revision。

修改已發布稿：管理頁另建 revision；保持 story_id、事實底稿與已讀進度。worker 會複核人工文字，**不會用新 writer 蓋掉人工修訂**。若替換事件，更新八則共同底稿並明確 FORCE_NEW_REVISION=true；不能只換某一版。

沒有提供「假裝真新聞」的範例底稿。fixtures 與測試檔均為虛構，live CLI 會拒絕 is_demo=true。

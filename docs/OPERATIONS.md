# 維護與營運
## 日常（live 整合完成後）
admin 查看今日 status、review errors、usage。尚未發布保留上一期；顯示真實出刊日。
目前 DEMO admin 不提供假成功按鈕。live 接線與完整管理操作見 STATUS 待辦。

## 失敗恢復
單步成功結果以 input hash + prompt version + model + config 重用；來源／文稿／模板變動會使相關步驟失效。
不可遇 PDF 失敗就重選八則、重跑 24 次模型。程式不自動加預算。
目前 cachedStep 單元邏輯已測，CLI 為本機 checkpoint；跨 runner durable cache / lease / usage 尚未整合，不能開排程。
模型 timeout 可能已計費但未回報，記 usage_unknown；重試前人工核對 provider。不能把它當 0 元。

## 發布與修訂
published revision 不可修改。新 revision → 三版／review → 六 PDF → hard gates → approve transaction。
修訂需更正說明，保持 story_id 便於本機閱讀進度延續。舊 PDF 保留。
auto 須至少三期真人試用及完整 live 驗收；敏感／衝突來源仍人工。

## 備份與回滾
定期 pg_dump 可還原 schema/data；獨立匯出 private storage 檔案及 hash manifest。在隔離專案驗證 restore。
單純 Vercel rollback 不會回退 DB migration。此批為新增 schema；後續採向後相容的 expand/contract，不直接刪欄。
不要在 Git 保存原始證據或 secrets。原文 cache 依來源政策最長七天；刪除前檢查發布資產引用。

## 家庭試用三期
每期記錄：版別、是否八則讀完、太難詞句、查詞次數、是否願意明天繼續、是否印出。
目前真人試用數為 0。CEFR 為初始寫作目標，未獲正式測級或 Cambridge 認證。


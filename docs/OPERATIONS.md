# 操作與復原

## 每日

編輯室查看 issue date、status、每步錯誤與 usage。review 模式下，比對三版、共同事實、引用來源、圖片 credit、六 PDF；核准才對讀者公開。當天失敗保留上一期，頁面顯示真實日期。

設定頁的分級／來源是可查閱的檔案配置；發布模式可在線設定。難度調整修改 config/edition-settings.mjs、版本化 Prompt，先校準與六 PDF 測試，再產生新 revision；不會無聲改掉舊期刊。

## 續跑與成本

預設 RESUME=true、FORCE_NEW_REVISION=false。相同輸入、Prompt、模型、provider 設定命中成功步驟；JSON 以固定欄位排序雜湊，跨 JSONB 讀取仍一致。快取內容損壞會停止，不偷偷重新花費。

worker 每 30 秒 heartbeat、lease 120 秒；過期後可接手，舊 owner 不能提交。主／補跑或人工重複觸發不會取得第二份有效 lease；當日已發布直接退出。明確要求新 revision 仍共用當日預算，不重置用量。

呼叫前 durable reserve，回應後 settle；timeout、未知 usage／202 會保留 unknown 記錄與預留額度。未知費率不等於 0 元。重跑前先核對 NVIDIA 帳戶；需要對帳時保留 request id／ticket 與實際 usage，不任意刪 reservation。額度達限停 needs_attention，不自動增加預算。

有 pending／usage_unknown 的中斷工作，補跑也會停 USAGE_RECONCILIATION_REQUIRED。管理者先在 NVIDIA 核對，再於工作明細記錄理由、允許續跑；此操作保留原費用狀態、calls/tokens 與預留額度，並非將費用改成 0。後續新不明呼叫需要另一次核對。

PDF 失敗不重選新聞或重寫已通過內容。修好模板／字體，原 job 續跑會重用 writer/reviewer。上傳以 PDF SHA256 路徑，不覆蓋既有檔；若 runner 中斷，先前成功步驟可重用，未完成的孤立檔留待有引用檢查的清理。

## 修訂與試讀

管理頁輸入標題、完整正文、兩詞彙與更正說明 → 新 draft → 原事實底稿複核 → 六 PDF → gates → 核准。舊 published payload/PDF 不可改寫；revision 與模板版本顯示在網頁／PDF。

在實際讀完後記錄難易、查字、意願與印刷觀察，不填孩子姓名／學校。DEMO、草稿、同一天多次修訂都不會冒充三期。auto 前至少三個不同已發布日，之後仍可改回 review。

## 備份與清理

定期匯出 DB、private Storage 的 manifest／檔案與 SHA256；在隔離專案驗證還原。已發布 revision、fact bundle、稿件與 PDF 保留；原始全文目前不落地，只保存經政策允許的必要證據摘錄。unused candidate pool 不作全文資料庫。

Storage 孤立檔刪除前，先比對 assets、issue_files 與已發布 references；目前不自動永久刪除它們。不要只因部署 rollback 就假設 DB 也 rollback。採相容的新增遷移，破壞性遷移另處理。

## 當前操作限制

沒有真實服務憑證或三期試讀，目前只能做 DEMO／隔離測試。來源供稿多樣性、模型 CEFR 品質、真實耗時與費用仍未測。現階段配圖採原創分類圖示；事件照片傳輸／個別權利尚未驗收，gate 會拒絕不支援的圖片型別。

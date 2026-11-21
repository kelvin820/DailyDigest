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

Vercel／Supabase 已連接，新聞流程可直接在編輯室選題、背景生成及發布。台北時間 09:00 截止選題、12:00 出刊；四篇手選已儲存時會沿用，未選滿則更新來源後由 LLM 選題。新聞正式發布要求十二張皆為 AI 插畫；分類圖示不能當作完成。七天真實試刊仍須逐期核對，不以合成服務的自動化測試替代。

### 生圖順位與診斷

`NVIDIA_IMAGE_MODEL_PRIORITY` 可配置一至三個既有 NVIDIA adapter 支援的模型 ID，以逗號按優先序排列；未設定時沿用 `NVIDIA_IMAGE_MODEL`，沒有默默啟用未驗證的模型或其他付費帳號。內容過濾、逾時及可重試的服務錯誤會轉下一個模型；憑證／預算錯誤立即停止。每次模型呼叫分別計入既有預算，最多三個模型都失敗仍會停刊待處理，不能保證供應商必定成功。

每次原始生圖請求以 `image-attempt:` 文件保存完整 prompt、模型、工作與年齡版、時間、狀態及錯誤碼；管理者可透過 setup 的 `image-attempts` 取得。舊期沒有原始請求全文，重建 prompt 必須標示來源，不能冒充 HTTP 原始紀錄。

`lib/media/illustration-sheet.ts` 提供四條橫幅的拼圖 prompt 與裁切：前三條為國小／國中／高中水彩，第四條為成人純黑白線描試樣。它已用實際生成樣張驗證裁切，但尚未接入正式出刊；成人版也尚未列為正式第四版。更換生圖服務後仍須驗證分格遵從度、裁切及版面，不能把四格 prompt 當作模型一定準確分格的保證。

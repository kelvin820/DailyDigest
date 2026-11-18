# NVIDIA 主線與 Google 暫停狀態 — 2026-11-18

使用者要求先跑通 NVIDIA，並暫停 Google 免費層生圖測試。沒有要求新增付費方案。

| 功能 | 真實 API 結果 | 目前狀態 |
|---|---|---|
| NVIDIA Nemotron 寫稿／複核 | run [44309609059](https://github.com/kelvin820/DailyDigest/actions/runs/44309609059)，同一自有虛構底稿三版 41／61／111 字 | 已取得實際文字稿，保留原始回應與國中詞義顯示修訂 |
| NVIDIA FLUX 3 Image Klein | run [44324709078](https://github.com/kelvin820/DailyDigest/actions/runs/44324709078) 咖啡店官方範例；run [44325343817](https://github.com/kelvin820/DailyDigest/actions/runs/44325343817) 公園水彩 | **兩張真實 API 圖已下載、解碼、像素檢查與目視通過** |
| Google Gemini | run [44326917649](https://github.com/kelvin820/DailyDigest/actions/runs/44326917649) 的 3.8 Flash 回 503；run [44327702497](https://github.com/kelvin820/DailyDigest/actions/runs/44327702497) 的 2.5 Flash 回 404 | 未產生三版稿；保留程式與失敗記錄，停止重試 |
| Google Nano Banana 2.1 | 上述兩次各一次圖片請求；回 429，最後一次安全診斷為免費層配額 0 | 使用者確認只有免費 API key，要求先不測；沒有代開計費或儲值 |

兩次成功 NVIDIA 圖片均為 `black-forest-labs/flux-3-image-klein`，50 步。公園成功提示詞：

> A watercolor painting of a public park with green trees, an empty bench and a winding path.

較長公園提示詞曾回 CONTENT_FILTERED；4 步設定也曾失敗。不能把這些歷史失敗概括成 NVIDIA 不支援生圖。已將程式預設改為實測成功的 FLUX 3，並保留每個模型自己的請求與回應格式。SDXL、SD3 Medium 的舊端點實測為 404。

## 已整合的離線閱讀／列印證據

- `/images/` 預設「自動選圖」：同一篇已有合適的 CC0 資料照，直接用照片；沒有新增生圖請求。
- `/images/elementary-nvidia.html` 及另外兩版可看實際 NVIDIA 插畫，保留 H／C／高中原表頭與實際 Nemotron 比較稿。
- `/image-probes/` 保留兩張 API 實測原樣本及各自 run 記錄。
- 三版 × 五種選擇 × 三尺寸共 45 組版面、圖片／版本切換、斷圖備援、缺圖 PDF 拒收已驗證。
- 12 份兩頁 PDF 使用資料照或實際 NVIDIA 插畫。PDF 仍是八篇舊虛構樣稿的版面測試，僅第一篇換圖；不是 24 篇新生成稿，不是真實出刊。
- 本輪閱讀／PDF 組裝重用已取得的回應，沒有新增模型呼叫。圖片二進位及 PDF 不進公開 GitHub 原始碼。

## 選圖規則與邊界

`lib/media/select.ts` 一次選定每則圖片，再共用到三版：有明確權利且相關的事件照 → 資料照 → 可用既有插畫／快取 AI 圖 → 缺圖、有助閱讀且適合概念表達時才生成 → 原創圖示。拒絕不相關、權利未確認或與事件不符的照片；下載／格式失敗會嘗試下一候選。

新生成預設最多兩次，失敗也計次；產圖前必須由呼叫方取得台北當日的原子額度保留。沒有共用額度服務或供應商時直接用圖示。單元測試涵蓋規則、失敗及三版共用；**尚未驗證跨 runner 的真實每日圖片額度、私有 Storage 或全期真實新聞自動出刊**。

Google adapter 與手動 Google Preview 保留供日後使用，現在沒有排程呼叫；NVIDIA 文字與圖片均沿用既有 GitHub Secret `LLM_API_KEY`。Google Secret `GEMINI_API_KEY` 已存於 GitHub，沒有寫入前端、原始碼或本地輸出。所有費用仍待供應商帳務核對，不宣稱免費或已自動發布。

# 圖片測試 — 2026-11-18（台北）

**最新進展：NVIDIA FLUX 3 Image Klein 已實際生成咖啡店與公園水彩，經下載／解碼／目視通過，並接入閱讀與 PDF 樣刊。** `/images/` 預設先用授權照片，另可切到 NVIDIA 插畫；`/image-probes/` 展示 API 原樣本。後續狀態與 Google 暫停決定以 [PROVIDER_PREVIEW_STATUS.md](PROVIDER_PREVIEW_STATUS.md) 為準；以下保留較早測試過程。

私人比較頁：https://dayday-digest-demo.kelvin820.chatgpt.site/images/ 。三版表頭沿用已選 H／C／高中原字體。

## 實際完成

- 對同一份已驗證的 NVIDIA 單篇虛構比較稿，提供「AI 插畫／資料照片／分類圖示」三種選擇；正文沒有重新生成。國中「蠔粉→蠟筆」的顯示修訂及原始 API 回應繼續保留。
- 水彩公園規劃插畫由本次 ChatGPT image generation 工具實際生成。工具沒有公開模型 ID，不冒稱為 NVIDIA 的圖片結果。
- 照片為 Plurdal 的 [Park Bench 2025.jpg](https://commons.wikimedia.org/wiki/File:Park_Bench_2025.jpg)。授權頁明列 CC0；記錄作者、來源頁、原始 URL、授權、拍攝日期及 SHA-256。已用既有 DNS pinning／redirect 檢查的下載器實際下載 6,460,242 bytes；不是熱連結，標示資料照、非本次現場。
- 共用 renderer 支援 raster、三版共用 asset ID 與可調焦點。輸入上限 10 MB／40M pixels、MIME 對照 decoder、拒絕外部 SVG／動畫／近乎純色及全透明圖、去 EXIF，產生長邊最多 1200 px WebP 及保留解析度的 JPEG 列印版。HTML 內容與署名仍跳脫處理；rendition 只接受本地 hash 路徑。
- 實測三版 × 三種圖片 × 375／768／1440 共 27 組版面；圖片／版本切換、斷圖圖示備援及 caption 更新通過。缺圖時 PDF 驗證拒絕產出，避免空白印刷。
- 兩種配圖各產生三版彩色／省墨，共 12 份兩頁 PDF。每份有八篇舊虛構樣稿，僅第一篇測配圖；全文、詞彙、嵌入字體、最低字級、無溢出及第一頁內嵌 raster 檢查通過。省墨版圖片為灰階。**不是八篇新的 API 生成稿，不是真實出刊。**

## NVIDIA 圖片 API 的實際限制

沿用 GitHub Secret `LLM_API_KEY`，沒有要求新 key、沒有讀取或公開 key。所有試驗手動觸發、每個 run 僅一次請求，沒有自動重試、排程、寫資料庫或出刊。費用未知，不宣稱免費。

| Run | 模型／結果 | 判定 |
|---|---|---|
| [44315249408](https://github.com/kelvin820/DailyDigest/actions/runs/44315249408) | FLUX.1-schnell，參考文件完整參數回 422 | 失敗 |
| [44315679923](https://github.com/kelvin820/DailyDigest/actions/runs/44315679923) | 改採官方 hosted 範例最少參數後，HTTP 200、有效 raster，但下載內容 RGB extrema 全為 (0,0) | **不可用**；原 artifact 的 generated 報告只代表當時格式檢查通過，已由實際目視／像素檢查否決，不能算成功 |
| [44316198636](https://github.com/kelvin820/DailyDigest/actions/runs/44316198636) | FLUX.2-klein-4b，未通過回應格式 | 失敗；沒有可用圖片 |

已補上純色圖拒收、HTTP 200 provider error 拒收、安全結構診斷及 data-URI/base64 空白相容。這些後續防護通過離線測試，**未再消耗 API 重測**。最後一次實際 FLUX.2 回應只保留錯誤碼，沒有保存 body，無法據此斷言是模型權限、內容過濾或其他 provider 問題。

目前有可用的實際工具生成插畫及授權照片；NVIDIA unattended 圖片生成仍未驗收。正式自動出刊前還需確認可用的圖片 API、跨 runner 每日兩張交易額度及 Supabase 私有 Storage 存取。現有照片／圖示備援不依賴這些憑證，不阻塞文字流程。

## 重跑本地驗證

比較稿目錄需含原 `report.json`、`checkpoints.json`、`developer-corrections.json`、`display-editions.json` 與 fonts；圖片二進位及 PDF 保留於 ignored output，不進公開原始碼 repo。

```sh
DD_CHROME=/usr/bin/chromium node --import tsx scripts/image-preview.ts \
  --comparison /path/to/verified-comparison \
  --illustration /path/to/tool-generated.png \
  --nvidia /path/to/actual-nvidia-artifact
DD_CHROME=/usr/bin/chromium node scripts/qa-images.mjs
python scripts/package-image-preview.py output/image-preview /path/to/static/images
```

未提供 `--photo` 時會從已核准的 Wikimedia 下載；可用 `--photo <已下載原檔>` 離線重跑。`--skip-pdf` 僅供排版迭代，未驗證的輸出不能通過 package script。NVIDIA 手動 smoke test：Actions → NVIDIA Image Preview；不應當作每日自動流程使用。

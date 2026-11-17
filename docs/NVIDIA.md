# NVIDIA Nemotron 整合

使用者於 2026-11-18 指定 NVIDIA Nemotron。初始 writer、reviewer 均用 `nvidia/nemotron-3-nano-30b-a3b`，各自獨立請求；型號不是學習成效或 A1 適合度的保證，需 live 校準。

官方 API：[Nano inference reference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-nano-30b-a3b-infer)、[Nano model card](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-nano-30b-a3b)。端點 `https://integrate.api.nvidia.com/v1/chat/completions`；採 Bearer key、非串流、明確 max_tokens、chat_template_kwargs.enable_thinking=false。

沒有假設該 hosted 型號一定支援 JSON schema constrained decoding。目前用 Prompt 提供 JSON schema，再由 Zod 嚴格驗證；最多一次格式修復，與暫時 HTTP 錯誤共用最多三次請求上限。每次請求先 reserve、完成後 settle。缺少 usage、timeout、202 非同步回應會停下或保留 usage_unknown，不推測為免費或成功。

金鑰環境名稱維持 LLM_API_KEY，僅 worker 可用。base URL 固定為 NVIDIA 官方服務；不接受來源文章指示改端點。cacheIdentity 只含 endpoint／非秘密參數，不含 key。回應中的 reasoning_content 不保存、不提供給讀者。

在有繼承 HTTP(S)_PROXY 的 Cloud 本機環境，使用 Node 24 的 NODE_USE_ENV_PROXY=1（環境範例已列），保留原代理與 CA。GitHub runner 沒有代理時會正常直連。來源抓取另有釘選 IP 的代理 transport；不關閉 TLS 驗證。

`tests/nvidia.test.ts` 是合成回應測試，證明請求與帳務控制，**不是 NVIDIA 連線或計費驗收**。目前沒有 key、沒有 live 呼叫，也沒有確認單價；使用 cost_unknown。NVIDIA 帳戶的模型可用性、quota／credits 與費率，以使用者帳戶為準。

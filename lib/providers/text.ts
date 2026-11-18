import { z } from 'zod';
export interface BudgetPort {
  reserve(input: number, output: number): unknown;
  settle(ticket: unknown, usage: { input_tokens: number; output_tokens: number }): unknown;
  fail(ticket: unknown): unknown;
}
export type Task = 'select' | 'facts' | 'write' | 'review' | 'revise';
export type GenerationRequest<T> = { task: Task; system: string; data: unknown;
  schema: z.ZodType<T>; model: string; timeoutMs: number; maxOutputTokens: number };
export interface TextModelProvider {
  readonly cacheIdentity?: string;
  generateStructured<T>(input: GenerationRequest<T>): Promise<{ data: T;
    usage: { input_tokens: number; output_tokens: number }; providerRequestId?: string }>;
}
export class FixtureProvider implements TextModelProvider {
  readonly cacheIdentity = 'fixture-not-live';
  constructor(private response: unknown) {}
  async generateStructured<T>(input: GenerationRequest<T>) {
    return { data: input.schema.parse(this.response), usage: { input_tokens: 0, output_tokens: 0 },
      providerRequestId: 'fixture-not-live' };
  }
}
export type InvalidStructuredReply = {task:Task;model:string;attempt:number;content:string;validation:unknown};
type ProviderOptions = { responseFormat?: 'json_object' | 'prompt'; disableThinking?: boolean;
  reasoningEffort?:'low';
  onInvalidReply?:(reply:InvalidStructuredReply)=>Promise<void> };
export class CompatibleProvider implements TextModelProvider {
  readonly cacheIdentity: string;
  constructor(private baseUrl: string, private key: string, private budget: BudgetPort,
    private options: ProviderOptions = { responseFormat: 'json_object' }) {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('INVALID_PROVIDER_ENDPOINT');
    this.cacheIdentity = JSON.stringify({ baseUrl, ...options, contract: 'structured-v2' });
  }
  async generateStructured<T>(input: GenerationRequest<T>) {
    const schemaText = JSON.stringify(z.toJSONSchema(input.schema));
    const totals = { input_tokens: 0, output_tokens: 0 };
    let formatRepairs = 0;
    let formatFeedback:unknown=null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const system = input.system + '\nReturn only JSON matching this schema; no prose, code fences or reasoning:\n' + schemaText +
        (formatRepairs ? '\nThe prior response was invalid. Return the complete schema-conforming JSON object only.' : '');
      const user = JSON.stringify({untrusted_data:input.data,...(formatFeedback?{format_validation:formatFeedback}:{})});
      const inputEstimate = Math.ceil((system.length + user.length) / 2) + 1000;
      const ticket = await this.budget.reserve(inputEstimate, input.maxOutputTokens);
      let response: Response;
      try {
        response = await fetch(this.baseUrl.replace(/\/$/, '') + '/chat/completions', {
          method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer ' + this.key,
            'Content-Type': 'application/json', Accept: 'application/json' },
          signal: AbortSignal.timeout(input.timeoutMs), body: JSON.stringify({ model: input.model,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            stream: false, temperature: 0,
            ...(this.options.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
            ...(this.options.disableThinking ? { chat_template_kwargs: { enable_thinking: false } } : {}),
            ...(this.options.reasoningEffort?{reasoning_effort:this.options.reasoningEffort}:{}),
            max_tokens: input.maxOutputTokens,
          }),
        });
      } catch { await this.budget.fail(ticket); throw Error('MODEL_TIMEOUT_OR_NETWORK'); }
      if (!response.ok || response.status === 202) {
        await this.budget.fail(ticket);
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
          const retry = response.headers.get('retry-after');
          const numeric = retry ? Number(retry) : NaN;
          const dateSeconds = retry ? (Date.parse(retry) - Date.now()) / 1000 : NaN;
          const seconds = Number.isFinite(numeric) ? Math.max(0, numeric) :
            Number.isFinite(dateSeconds) ? Math.max(0, dateSeconds) : 2 ** attempt;
          if (seconds > 30) throw Error('MODEL_RETRY_LATER');
          await new Promise(r => setTimeout(r, seconds * 1000 + Math.random() * 300));
          continue;
        }
        throw Error(response.status === 202 ? 'MODEL_ASYNC_NOT_SUPPORTED' : 'MODEL_HTTP_' + response.status);
      }
      let raw;
      try { raw = await response.json(); }
      catch { await this.budget.fail(ticket); throw Error('MODEL_RESPONSE_INVALID'); }
      const usage = { input_tokens: raw.usage?.prompt_tokens, output_tokens: raw.usage?.completion_tokens };
      if (!Number.isInteger(usage.input_tokens) || usage.input_tokens < 0 ||
        !Number.isInteger(usage.output_tokens) || usage.output_tokens < 0) {
        await this.budget.fail(ticket); throw Error('MODEL_USAGE_MISSING');
      }
      await this.budget.settle(ticket, usage);
      totals.input_tokens += usage.input_tokens; totals.output_tokens += usage.output_tokens;
      try {
        if (raw.choices?.[0]?.finish_reason === 'length') throw Error('TRUNCATED_JSON');
        return { data: input.schema.parse(JSON.parse(raw.choices[0].message.content)),
          usage: totals, providerRequestId: typeof raw.id === 'string' ? raw.id : undefined };
      } catch (error) {
        formatFeedback=error instanceof z.ZodError?error.issues:{code:'invalid_json_or_truncated_response'};
        if(this.options.onInvalidReply)await this.options.onInvalidReply({task:input.task,model:input.model,
          attempt,content:typeof raw.choices?.[0]?.message?.content==='string'?
            raw.choices[0].message.content.replace(/<think>[\s\S]*?<\/think>/gi,'').slice(0,50000):'',validation:formatFeedback});
        if (formatRepairs++ < 1 && attempt < 2) continue;
        throw Error('MODEL_SCHEMA_INVALID');
      }
    }
    throw Error('MODEL_RETRY_EXHAUSTED');
  }
}
// NVIDIA NIM basic API contract verified against its official Nano reference.
// No undocumented structured-output parameter is assumed. Prompt JSON + Zod remain strict.
export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const DEFAULT_NEMOTRON_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b';
export class NvidiaProvider extends CompatibleProvider {
  constructor(key: string, budget: BudgetPort, onInvalidReply?:ProviderOptions['onInvalidReply']) {
    super(NVIDIA_BASE_URL, key, budget, { responseFormat: 'prompt', disableThinking: true,onInvalidReply });
  }
}

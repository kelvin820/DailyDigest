import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { NvidiaProvider, DEFAULT_NEMOTRON_MODEL, NVIDIA_BASE_URL } from '../lib/providers/text';
import { Budget } from '../lib/pipeline/state.mjs';

test('NVIDIA contract uses bounded non-streaming JSON, disables thinking, accounts format repair', async t => {
  const requests: { url: string; payload: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    requests.push({ url, payload: JSON.parse(String(options.body)) });
    return new Response(JSON.stringify({ id: 'fixture-request-' + requests.length,
      choices: [{ message: { content: requests.length === 1 ? 'invalid JSON' : '{"ok":true}',
        reasoning_content: 'fixture-only-discarded' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 20, completion_tokens: 5 } }), { headers: { 'Content-Type': 'application/json' } });
  });
  const budget = new Budget({ maxCalls: 3, inputRate: undefined, outputRate: undefined });
  const provider = new NvidiaProvider('fixture-not-a-real-key', budget);
  const result = await provider.generateStructured({ task: 'review', system: 'Synthetic JSON test', data: {},
    schema: z.object({ ok: z.boolean() }).strict(), model: DEFAULT_NEMOTRON_MODEL,
    timeoutMs: 1000, maxOutputTokens: 100 });
  assert.deepEqual(result.data, { ok: true }); assert.equal(requests.length, 2);
  assert.equal(requests[0].url, NVIDIA_BASE_URL + '/chat/completions');
  assert.equal(requests[0].payload.stream, false); assert.equal(requests[0].payload.max_tokens, 100);
  assert.deepEqual(requests[0].payload.chat_template_kwargs, { enable_thinking: false });
  assert.equal(requests[0].payload.response_format, undefined);
  assert.deepEqual(result.usage, { input_tokens: 40, output_tokens: 10 });
  assert.equal(budget.calls, 2); assert.equal(budget.ledger.length, 2);
  assert.equal(JSON.stringify(result).includes('discarded'), false);
});

import { setTimeout as delay } from 'node:timers/promises';

async function rpc(db, name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw Error(error.message || 'DATABASE_OPERATION_FAILED');
  return data;
}
function stepAddress(key) {
  const parts = key.split(':');
  if (parts.length === 4 && ['elementary', 'junior', 'senior'].includes(parts[1])) {
    return { stage: parts[2] + '-' + parts[3], story_id: parts[0], edition: parts[1] };
  }
  return { stage: key, story_id: '', edition: '' };
}
export class DurableStore {
  constructor(db, job, owner) { this.db = db; this.job = job; this.owner = owner; }
  async get(key) {
    const address = stepAddress(key);
    return rpc(this.db, 'read_generation_step', { job: this.job, owner: this.owner,
      stage_name: address.stage, story: address.story_id, edition_name: address.edition });
  }
  async save(key, value) {
    return rpc(this.db, 'save_generation_step', { job: this.job, owner: this.owner,
      step: { ...stepAddress(key), ...value } });
  }
  async begin(key, inputHash, input) {
    await this.save(key, { input_hash: inputHash, status: 'running',
      model: input.model, prompt_version: input.promptVersion });
  }
  async set(key, value) {
    await this.save(key, { status: 'success', input_hash: value.inputHash,
      output: value.output, output_hash: value.outputHash, usage: value.output?.usage });
  }
  async fail(key, inputHash, error) {
    // Only a short machine code is recorded, never a provider HTTP body or secret.
    await this.save(key, { status: 'failed', input_hash: inputHash,
      error: /^[A-Z0-9_:.-]{1,150}$/.test(error.message) ? error.message : 'STAGE_FAILED' });
  }
}
export class DurableBudget {
  constructor(db, job, owner) { this.db = db; this.job = job; this.owner = owner; }
  reserve(inputTokens, maxOutput) {
    return rpc(this.db, 'reserve_model_call', { job: this.job, owner: this.owner,
      input_tokens: inputTokens, output_tokens: maxOutput });
  }
  async settle(ticket, usage) {
    const result = await rpc(this.db, 'settle_model_call', {
      job: this.job, owner: this.owner, ticket: ticket.id, usage });
    if (result.over_budget) throw Error('BUDGET_EXCEEDED');
  }
  fail(ticket) {
    return rpc(this.db, 'settle_model_call', { job: this.job, owner: this.owner, ticket: ticket.id, usage: null });
  }
}
export async function heartbeat(db, job, owner, work) {
  const stop = new AbortController();
  let lost;
  const renewal = (async () => {
    try {
      while (!stop.signal.aborted) {
        await delay(30_000, undefined, { signal: stop.signal });
        await rpc(db, 'heartbeat_job', { job, owner });
      }
    } catch (error) { if (!stop.signal.aborted) lost = error; }
  })();
  try {
    return await work(() => { if (lost) throw Error('LEASE_LOST'); });
  } finally { stop.abort(); await renewal; }
}

import {DAILY_STORY_COUNT} from '../config/issue-settings.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { taipeiDate } from '../lib/content/metrics';
import { factSchema } from '../lib/schemas/editorial';
import { NvidiaProvider, NVIDIA_BASE_URL, DEFAULT_NEMOTRON_MODEL } from '../lib/providers/text';
import { DurableStore, DurableBudget, heartbeat } from '../lib/pipeline/durable.mjs';
import { cachedStep, hash } from '../lib/pipeline/state.mjs';
import { produceEditions } from '../lib/pipeline/editorial';
import { reviewExisting } from '../lib/pipeline/review-existing';
import { publishGate } from '../lib/pipeline/gates.mjs';
import { renderIssues } from './render';
import { intakeFacts, sourceSchema, type History } from '../lib/pipeline/intake';
import { httpsUrl } from '../lib/schemas/urls';

// All live work uses a durable job/lease before any model request. Publication stays opt-in.
if (process.env.LIVE_GENERATION_ENABLED !== 'true' || process.env.DEMO_MODE === 'true') {
  throw Error('LIVE_DRAFT_DISABLED');
}
const settings = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(), SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APP_URL: httpsUrl,
  LLM_PROVIDER: z.literal('nvidia').default('nvidia'), LLM_BASE_URL: z.literal(NVIDIA_BASE_URL).default(NVIDIA_BASE_URL), LLM_API_KEY: z.string().min(1),
  WRITER_MODEL: z.string().regex(/^nvidia\/[A-Za-z0-9_.-]+$/).default(DEFAULT_NEMOTRON_MODEL),
  REVIEWER_MODEL: z.string().regex(/^nvidia\/[A-Za-z0-9_.-]+$/).default(DEFAULT_NEMOTRON_MODEL),
  APPROVED_FACTS_FILE: z.string().min(1).optional(),
  ISSUE_DATE: z.iso.date().default(taipeiDate()),
  DAILY_BUDGET_USD: z.coerce.number().finite().nonnegative().default(2),
  MAX_MODEL_CALLS: z.coerce.number().int().positive().default(100),
  MAX_MODEL_TOKENS: z.coerce.number().int().positive().default(200000),
  PUBLISH_MODE: z.enum(['review','auto']).default('review'), DRAFT_ONLY: z.enum(['true','false']).default('true'),
  RESUME: z.enum(['true', 'false']).default('true'),
  FORCE_NEW_REVISION: z.enum(['true', 'false']).default('false'),
}).parse(Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== '')));
if(settings.ISSUE_DATE>taipeiDate())throw Error('FUTURE_ISSUE_DATE_REJECTED');
const rate = (name: string) => process.env[name] ? z.coerce.number().finite().nonnegative().parse(process.env[name]) : null;
const limits = { usd: settings.DAILY_BUDGET_USD, inputRate: rate('LLM_INPUT_USD_PER_MILLION'),
  outputRate: rate('LLM_OUTPUT_USD_PER_MILLION'), maxCalls: settings.MAX_MODEL_CALLS, maxTokens: settings.MAX_MODEL_TOKENS };
const registry = z.array(sourceSchema).parse(JSON.parse(await readFile('config/sources.json', 'utf8')));
const suppliedFacts = settings.APPROVED_FACTS_FILE ? z.array(factSchema).length(DAILY_STORY_COUNT).parse(
  JSON.parse(await readFile(settings.APPROVED_FACTS_FILE, 'utf8'))) : undefined;
if (suppliedFacts && (suppliedFacts.some(f => f.is_demo) || new Set(suppliedFacts.map(f => f.event_key)).size !== DAILY_STORY_COUNT)) {
  throw Error('DEMO_OR_DUPLICATE_EVENTS_REJECTED');
}
if (!suppliedFacts && !registry.some(s => s.status === 'enabled' && s.fetch_enabled && s.rewrite_policy === 'allowed' &&
  s.evidence_policy === 'permanent_excerpt')) throw Error('SOURCE_POLICIES_NOT_READY');
const db = createClient(settings.NEXT_PUBLIC_SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const automatic = settings.PUBLISH_MODE === 'auto' && settings.DRAFT_ONLY === 'false';
if (automatic) {
  const { data: config, error } = await db.from('app_settings').select('value').eq('key','publishing').single();
  if (error || config?.value?.mode !== 'auto' || config.value.live_enabled !== true || config.value.trial_issues < 3) {
    throw Error('AUTO_NOT_APPROVED');
  }
}
const owner = randomUUID();
const intakeRequestHash='intake:'+hash({storyCount:DAILY_STORY_COUNT,registry,model:settings.WRITER_MODEL,provider:settings.LLM_PROVIDER,
  prompts:await Promise.all(['prompts/select.v1.txt','prompts/facts.v1.txt'].map(async path=>hash(await readFile(path,'utf8'))))});
const { data: work, error: jobError } = await db.rpc('start_issue_job', {
  day: settings.ISSUE_DATE, owner, story_ids: suppliedFacts?.map(f => f.story_id) || [],
  facts_hash: suppliedFacts ? hash(suppliedFacts) : intakeRequestHash, limits,
  resume: settings.RESUME === 'true', force_new_revision: settings.FORCE_NEW_REVISION === 'true',
});
if (jobError) throw Error(jobError.message);
if (!work.acquired) {
  console.log(JSON.stringify({ status: work.status, generated: false }));
  process.exit(0);
}
const folder = resolve('.runtime', settings.ISSUE_DATE + '-r' + work.revision);
await mkdir(folder, { recursive: true });
const store = new DurableStore(db, work.job_id, owner);
const budget = new DurableBudget(db, work.job_id, owner);
const provider = new NvidiaProvider(settings.LLM_API_KEY, budget);
let completed = false;
let published = false;
try {
  await heartbeat(db, work.job_id, owner, async (assertLease: () => void) => {
    if (work.status === 'ready' && !automatic) { completed = true; return; }
    if (work.status === 'ready' && automatic) {
      const { data: ready, error } = await db.from('issue_revisions').select('gate_report').eq('id',work.revision_id).single();
      if (error) throw error;
      if (ready.gate_report.needs_human === false) {
        const { error: publishError } = await db.rpc('publish_revision',{target:work.revision_id,automatic:true});
        if (publishError) throw publishError;
        published = true;
      }
      completed = true; return;
    }
    const facts = suppliedFacts || (await intakeFacts({ registry, issueDate: settings.ISSUE_DATE,
      provider, store, model: settings.WRITER_MODEL, history: await cachedStep(store, 'history',
        { issueDate: settings.ISSUE_DATE }, async (): Promise<History> => {
          const { data: issues, error } = await db.from('issues').select('current_revision_id')
            .lt('issue_date', settings.ISSUE_DATE).not('current_revision_id', 'is', null)
            .order('issue_date', { ascending: false }).limit(7);
          if (error) throw error;
          if (!issues?.length) return [];
          const { data: refs, error: referenceError } = await db.from('issue_story_bundles')
            .select('story_bundles(event_key,fact_payload)').in('revision_id', issues.map(i => i.current_revision_id));
          if (referenceError) throw referenceError;
          const bundles = z.array(z.object({ story_bundles: z.object({ event_key: z.string(),
            fact_payload: z.object({ claims: z.unknown() }) }) })).parse(refs);
          return bundles.map(b => ({ event_key: b.story_bundles.event_key, claims: b.story_bundles.fact_payload.claims }));
        }) })).facts;
    const validatedFacts = z.array(factSchema).length(DAILY_STORY_COUNT).parse(facts);
    const { error: bindError } = await db.rpc('bind_issue_facts', { job: work.job_id, owner,
      story_ids: validatedFacts.map(f => f.story_id), facts_hash: hash(validatedFacts) });
    if (bindError) throw bindError;
    const { data: existing, error: existingError } = await db.from('edition_payloads')
      .select('payload').eq('revision_id', work.revision_id);
    if (existingError) throw existingError;
    const content = existing?.length ? await reviewExisting(existing.map(p => p.payload), validatedFacts, provider, store, settings.REVIEWER_MODEL) :
      await produceEditions({ facts: validatedFacts, issueDate: settings.ISSUE_DATE, revision: work.revision,
        provider, store, writerModel: settings.WRITER_MODEL, reviewerModel: settings.REVIEWER_MODEL });
    content.editions=content.editions.map(payload=>({...payload,templateVersion:'1.1',
      webUrl:new URL('/issues/'+settings.ISSUE_DATE+'?edition='+payload.edition,settings.APP_URL).href}));
    assertLease();
    // Template and font bytes are part of the render cache; model steps stay independent.
    const rendererHash = hash(await Promise.all(['app/globals.css', 'lib/render.mjs','config/edition-settings.mjs',
      'public/fonts/NotoSans-Regular.ttf', 'public/fonts/Newsreader.ttf', 'public/fonts/NotoSansTC.ttf']
      .map(async path => createHash('sha256').update(await readFile(path)).digest('hex'))));
    const files = await cachedStep(store, 'render-upload', { editions: content.editions, rendererHash }, async () => {
      const rendered = await renderIssues(content.editions, resolve(folder, 'pdf'));
      const uploaded = [];
      for (const file of rendered) {
        assertLease();
        const bytes = await readFile(file.path);
        const fileHash = createHash('sha256').update(bytes).digest('hex');
        const storagePath = `${settings.ISSUE_DATE}/r${work.revision}/${file.edition}-${file.mode}-${fileHash}.pdf`;
        const { error } = await db.storage.from('issue-files').upload(storagePath, bytes,
          { contentType: 'application/pdf', upsert: false });
        // A prior identical content-addressed upload may have completed before a crash.
        if (error) {
          const { data: prior, error: readError } = await db.storage.from('issue-files').download(storagePath);
          if (readError || !prior || createHash('sha256').update(Buffer.from(await prior.arrayBuffer())).digest('hex') !== fileHash) {
            throw Error('PDF_UPLOAD_NOT_VERIFIED');
          }
        }
        uploaded.push({ ...file, storagePath, fileHash });
      }
      return uploaded;
    });
    const report = publishGate({ ...content, facts: validatedFacts, files, live: true });
    await writeFile(resolve(folder, 'gates.json'), JSON.stringify(report, null, 2));
    if (!report.pass) throw Error('PUBLISH_GATES_FAILED');
    assertLease();
    const { error } = await db.rpc('stage_revision_artifacts', {
      job: work.job_id, owner, payloads: content.editions.map(payload => ({ payload, content_hash: hash(payload) })),
      review_records: content.reviews, fact_records: validatedFacts, file_records: files, report,
    });
    if (error) throw Error(error.message);
    if (automatic && !report.needs_human) {
      const { error: publishError } = await db.rpc('publish_revision',{target:work.revision_id,automatic:true});
      if (publishError) throw publishError;
      published = true;
    }
    completed = true;
  });
} catch(error) {
  const message=error instanceof Error?error.message:'WORKER_FAILED';
  const code=/^[A-Z][A-Za-z0-9_:.-]{0,199}$/.test(message)?message:'WORKER_FAILED';
  await db.rpc('record_job_error',{job:work.job_id,owner,error_code:code});
  throw Error(code);
} finally {
  const { error } = await db.rpc('release_job', { job: work.job_id, owner,
    final_status: published ? 'published' : completed ? 'needs_review' : 'needs_attention' });
  if (error) console.error('LEASE_RELEASE_NOT_CONFIRMED');
}
console.log(JSON.stringify({ status: published ? 'published' : 'needs_review', published,
  jobId: work.job_id, revisionId: work.revision_id, note: published ? '已由資料庫交易發布。' : '六份 PDF 與稿件已存成私有草稿，仍需管理者核准。' }));

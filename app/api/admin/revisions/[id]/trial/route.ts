import { z } from 'zod';
import { membership, demoMode } from '../../../../../../lib/auth/server';
import { checkOrigin, json, apiError } from '../../../../../../lib/api';
const input = z.object({ notes: z.string().trim().min(1).max(2000) }).strict();
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(req);
    if (demoMode()) return json({ error: 'DEMO_NOT_A_TRIAL_ISSUE' }, 409);
    const { db } = await membership(true);
    const target = z.uuid().parse((await params).id), data = input.parse(await req.json());
    const { data: allowed, error: limitError } = await db.rpc('consume_admin_action', { action_name: 'trial' });
    if (limitError || !allowed) return json({ error: 'RATE_LIMIT' }, 429);
    const { data: trials, error } = await db.rpc('record_family_trial', { target, notes: data.notes });
    if (error) return json({ error: 'PUBLISHED_LIVE_ISSUE_REQUIRED' }, 409);
    return json({ status: 'recorded', trialIssues: trials });
  } catch (error) { return apiError(error); }
}

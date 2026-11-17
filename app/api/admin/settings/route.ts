import { z } from 'zod';
import { membership, demoMode } from '../../../../lib/auth/server';
import { checkOrigin, json, apiError } from '../../../../lib/api';
const input = z.object({ mode: z.enum(['review', 'auto']) }).strict();
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    if (demoMode()) return json({ error: 'DEMO_CANNOT_CONFIGURE' }, 409);
    const { db } = await membership(true);
    const data = input.parse(await req.json());
    const { data: allowed, error: limitError } = await db.rpc('consume_admin_action', { action_name: 'settings' });
    if (limitError || !allowed) return json({ error: 'RATE_LIMIT' }, 429);
    const { error } = await db.rpc('configure_publishing', { target_mode: data.mode });
    if (error) return json({ error: 'MODE_CHANGE_REQUIRES_THREE_TRIAL_ISSUES' }, 409);
    return json({ status: 'saved', mode: data.mode });
  } catch (error) { return apiError(error); }
}

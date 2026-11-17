import { z } from 'zod';
import { membership, demoMode } from '../../../../../../lib/auth/server';
import { json, apiError, checkOrigin } from '../../../../../../lib/api';
const approvalInput = z.object({ expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(req);
    if (demoMode()) return json({ error: 'DEMO_CANNOT_PUBLISH' }, 409);
    const { db } = await membership(true);
    const id = z.uuid().parse((await params).id);
    const input = approvalInput.parse(await req.json());
    const { data: allowed, error: limitError } = await db.rpc('consume_admin_action', { action_name: 'approve' });
    if (limitError || !allowed) return json({ error: 'RATE_LIMIT' }, 429);
    const { error } = await db.rpc('approve_reviewed_revision', {
      target: id, expected_fingerprint: input.expectedFingerprint,
    });
    if (error) return json({ error: 'PUBLISH_GATE_OR_SNAPSHOT_FAILED' }, 409);
    return json({ status: 'published' });
  } catch (e) { return apiError(e); }
}

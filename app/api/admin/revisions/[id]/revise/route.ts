import { z } from 'zod';
import { membership, demoMode } from '../../../../../../lib/auth/server';
import { json, apiError, checkOrigin } from '../../../../../../lib/api';
import { revisionInput, revisedPayload } from '../../../../../../lib/schemas/revision';
import { editionSchema } from '../../../../../../lib/schemas/edition';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(req);
    if (demoMode()) return json({ error: 'DEMO_CANNOT_REVISE' }, 409);
    const { db } = await membership(true);
    const id = z.uuid().parse((await params).id);
    if (Number(req.headers.get('content-length') || 0) > 24_000) return json({ error: 'BODY_TOO_LARGE' }, 413);
    const text = await req.text();
    if (Buffer.byteLength(text) > 24_000) return json({ error: 'BODY_TOO_LARGE' }, 413);
    const input = revisionInput.parse(JSON.parse(text));
    const { data: source, error } = await db.rpc('admin_revision', { target: id });
    if (error || !source) return json({ error: 'NOT_FOUND' }, 404);
    if (source.fingerprint !== input.expectedFingerprint) return json({ error: 'STALE_REVISION' }, 409);
    const payload = z.array(editionSchema).parse(source.payloads).find(p => p.edition === input.edition);
    if (!payload) return json({ error: 'EDITION_NOT_FOUND' }, 404);
    const updated = revisedPayload(payload, input);
    const { data: allowed, error: limitError } = await db.rpc('consume_admin_action', { action_name: 'revise' });
    if (limitError || !allowed) return json({ error: 'RATE_LIMIT' }, 429);
    const { data: revisionId, error: revisedError } = await db.rpc('revise_revision', {
      target: id, expected_fingerprint: input.expectedFingerprint, changed_edition: input.edition,
      updated_payload: updated, correction: input.correctionNote,
    });
    if (revisedError) return json({ error: 'REVISION_CONFLICT', instruction: '重新載入後再試。' }, 409);
    return json({ status: 'draft', revisionId, published: false,
      note: '新版本需重新複核並產生六份 PDF；已發布版本保持原狀。' }, 201);
  } catch (e) { return apiError(e); }
}

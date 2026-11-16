import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as store from '@/lib/store';
import { extractProfile, parseJobsCsv, hash } from '@/lib/domain';
import { inferRequirements } from '@/lib/ollama';
import { fixtures, syntheticResume } from '@/fixtures/jobs';
import { jobInput, profileSchema, trackingSchema, extractionSchema } from '@/lib/contracts';
import { assertWorkspaceAvailable, startExtraction } from '@/lib/workspace-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function guard(req: Request, mutation = false) {
  const host = req.headers.get('host') || '';
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) throw new Error('Local access only');
  // Next's internal request URL can use localhost even when the browser uses
  // 127.0.0.1. Compare against the validated Host, never a forwarded header.
  if (mutation && req.headers.get('origin') !== `http://${host}`)
    throw new Error('Same-origin request required');
  if (mutation && !req.headers.get('content-type')?.startsWith('application/json'))
    throw new Error('JSON content type required');
}
const commands = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), job: jobInput }),
  z.object({ action: z.literal('edit'), id: z.uuid(), job: jobInput }),
  z.object({ action: z.literal('delete'), id: z.uuid(), confirmed: z.literal(true) }),
  z.object({ action: z.literal('fixtures') }),
  z.object({ action: z.literal('import'), csv: z.string().max(512000) }),
  z.object({ action: z.literal('profile-extract'), resume: z.string().min(30).max(16000) }),
  z.object({ action: z.literal('profile-save'), profile: profileSchema }),
  z.object({ action: z.literal('profile-clear'), confirmed: z.literal(true) }),
  z.object({ action: z.literal('tracking'), id: z.uuid(), tracking: trackingSchema }),
  z.object({ action: z.literal('extract'), id: z.uuid() }),
  z.object({ action: z.literal('requirements'), id: z.uuid(), extraction: extractionSchema }),
  z.object({ action: z.literal('draft-create'), id: z.uuid() }),
  z.object({
    action: z.literal('draft-update'),
    id: z.uuid(),
    draftId: z.uuid(),
    text: z.string().trim().min(20).max(5000),
    status: z.enum(['pending', 'approved', 'rejected']),
    approved: z.boolean(),
  }),
  z.object({ action: z.literal('keep-both'), id: z.uuid(), otherId: z.uuid() }),
]);
function errorResponse(e: unknown) {
  const message =
    e instanceof z.ZodError
      ? 'Invalid input. Check required fields, dates and size limits.'
      : e instanceof Error
        ? e.message
        : 'Request failed';
  // Never return payloads, SQL diagnostics, stacks or unrecognized internal errors.
  const safe = /sqlite|SQLITE|constraint failed|ENOENT|database|fetch failed/i.test(message)
    ? 'Local storage operation failed. No private details were logged.'
    : message.slice(0, 500);
  return NextResponse.json({ error: safe }, { status: e instanceof store.Conflict ? 409 : 400 });
}
export async function GET(req: Request) {
  try {
    guard(req);
    assertWorkspaceAvailable();
    const url = new URL(req.url),
      id = url.searchParams.get('id');
    if (url.searchParams.has('export'))
      return new Response(store.exportCsv(), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="applications.csv"',
          'Cache-Control': 'no-store',
        },
      });
    if (id) {
      z.uuid().parse(id);
      return NextResponse.json({
        job: store.getJob(id),
        drafts: store.getDrafts(id),
        events: store.events(id),
      });
    }
    return NextResponse.json({
      jobs: store.listJobs(),
      profile: store.getProfile(),
      syntheticResume,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
async function body(req: Request) {
  if (!req.body) throw new Error('Request body required');
  const reader = req.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      length += r.value.length;
      if (length > 600000) throw new Error('Request exceeds 600 KB');
      chunks.push(r.value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function POST(req: Request) {
  try {
    guard(req, true);
    const c = commands.parse(await body(req));
    assertWorkspaceAvailable();
    let result: unknown = { ok: true };
    switch (c.action) {
      case 'add':
        result = store.addJob(c.job);
        break;
      case 'edit':
        result = store.updateJob(c.id, c.job);
        break;
      case 'delete':
        store.deleteJob(c.id);
        break;
      case 'fixtures':
        result = store.importJobs(fixtures);
        break;
      case 'import':
        result = store.importJobs(parseJobsCsv(c.csv));
        break;
      case 'profile-extract':
        result = extractProfile(c.resume);
        break;
      case 'profile-save':
        result = store.saveProfile(c.profile);
        break;
      case 'profile-clear':
        store.clearProfile();
        break;
      case 'tracking':
        store.saveTracking(c.id, c.tracking);
        break;
      case 'extract': {
        const job = store.getJob(c.id);
        const finish = startExtraction();
        try {
          const extraction = await inferRequirements(job.description);
          store.saveExtraction(c.id, extraction, job.updatedAt);
          result = extraction;
        } catch (e) {
          if (!(e instanceof store.Conflict))
            store.extractionFailed(c.id, e instanceof Error ? e.message : 'Extraction failed');
          throw e;
        } finally {
          finish();
        }
        break;
      }
      case 'requirements': {
        const job = store.getJob(c.id);
        store.saveExtraction(
          c.id,
          {
            ...c.extraction,
            provider: 'human',
            model: 'human-reviewed',
            at: new Date().toISOString(),
            durationMs: 0,
            inputHash: hash(job.description),
          },
          job.updatedAt,
        );
        break;
      }
      case 'draft-create':
        store.createDraft(c.id);
        break;
      case 'draft-update':
        store.updateDraft(c.id, c.draftId, c.text, c.status, c.approved);
        break;
      case 'keep-both':
        store.keepBoth(c.id, c.otherId);
        break;
    }
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

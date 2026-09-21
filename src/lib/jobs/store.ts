import { getSupabaseAdmin, inMemoryDb } from '../db/supabase';

export type JobStatus =
  | 'pending'
  | 'extracting'
  | 'transcribing'
  | 'scoring'
  | 'rendering'
  | 'completed'
  | 'failed';

export interface VideoJobRecord {
  id: string;
  userId: string;
  status: JobStatus;
  progress: number; // 0-100
  stageDetail: string;
  fileKey: string;
  filename: string;
  language: string;
  scriptPreference: string;
  durationSec: number;
  resultKey: string | null;
  error: string | null;
  billingJobId: string;
  createdAt: string;
  updatedAt: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Supabase jobs.user_id is a UUID FK — demo/non-UUID users run on the in-memory store. */
function useSupabaseFor(userId: string): boolean {
  return Boolean(getSupabaseAdmin()) && UUID_RE.test(userId);
}

function rowToRecord(row: any, fallbackUserId?: string): VideoJobRecord {
  const storage = row.storage_keys || {};
  return {
    id: row.id,
    userId: row.user_id || fallbackUserId || 'demo-user-1',
    status: row.status,
    progress: row.progress ?? 0,
    stageDetail: row.stage_detail || '',
    fileKey: storage.fileKey || '',
    filename: row.source_filename || storage.filename || 'media.mp4',
    language: row.language || storage.language || 'auto',
    scriptPreference: row.script_preference || storage.scriptPreference || 'romanized',
    durationSec: Number(row.duration_sec ?? storage.durationSec ?? 0),
    resultKey: row.result_key || storage.resultKey || null,
    error: row.error_message || null,
    billingJobId: storage.billingJobId || row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createJob(input: {
  userId: string;
  fileKey: string;
  filename: string;
  language: string;
  scriptPreference: string;
  durationSec: number;
  billingJobId: string;
}): Promise<VideoJobRecord> {
  const now = new Date().toISOString();

  if (useSupabaseFor(input.userId)) {
    try {
      const supabase = getSupabaseAdmin()!;
      const { data, error } = await supabase
        .from('jobs')
        .insert({
          user_id: input.userId,
          source_type: 'file',
          duration_sec: Math.round(input.durationSec),
          status: 'pending',
          progress: 0,
          stage_detail: 'Queued for background processing…',
          source_filename: input.filename,
          language: input.language,
          script_preference: input.scriptPreference,
          storage_keys: {
            fileKey: input.fileKey,
            filename: input.filename,
            language: input.language,
            scriptPreference: input.scriptPreference,
            durationSec: input.durationSec,
            billingJobId: input.billingJobId,
          },
        })
        .select('*')
        .single();
      if (error) throw error;
      return rowToRecord(data, input.userId);
    } catch (err: any) {
      console.warn('[Jobs] Supabase insert failed, using in-memory store:', err.message);
    }
  }

  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: VideoJobRecord = {
    id,
    userId: input.userId,
    status: 'pending',
    progress: 0,
    stageDetail: 'Queued for background processing…',
    fileKey: input.fileKey,
    filename: input.filename,
    language: input.language,
    scriptPreference: input.scriptPreference,
    durationSec: input.durationSec,
    resultKey: null,
    error: null,
    billingJobId: input.billingJobId,
    createdAt: now,
    updatedAt: now,
  };
  inMemoryDb.jobs.set(id, record);
  return record;
}

export async function getJob(id: string): Promise<VideoJobRecord | null> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { data, error } = await supabase.from('jobs').select('*').eq('id', id).single();
      if (!error && data) return rowToRecord(data);
    } catch (_) {}
  }
  return (inMemoryDb.jobs.get(id) as VideoJobRecord) || null;
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<VideoJobRecord, 'status' | 'progress' | 'stageDetail' | 'resultKey' | 'error' | 'durationSec'>>
): Promise<VideoJobRecord | null> {
  const existing = await getJob(id);
  if (!existing) return null;

  const updated: VideoJobRecord = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  if (useSupabaseFor(existing.userId)) {
    try {
      const supabase = getSupabaseAdmin()!;
      const { error } = await supabase
        .from('jobs')
        .update({
          status: updated.status,
          progress: updated.progress,
          stage_detail: updated.stageDetail,
          result_key: updated.resultKey,
          error_message: updated.error,
          duration_sec: Math.round(updated.durationSec),
          updated_at: updated.updatedAt,
          storage_keys: {
            fileKey: updated.fileKey,
            filename: updated.filename,
            language: updated.language,
            scriptPreference: updated.scriptPreference,
            durationSec: updated.durationSec,
            billingJobId: updated.billingJobId,
            resultKey: updated.resultKey,
          },
        })
        .eq('id', id);
      if (error) throw error;
      return updated;
    } catch (err: any) {
      console.warn('[Jobs] Supabase update failed, using in-memory store:', err.message);
    }
  }

  inMemoryDb.jobs.set(id, updated);
  return updated;
}

import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'flowzora-clips' });

/** True when the app can reach Inngest Cloud (queue available). */
export function isInngestConfigured(): boolean {
  return Boolean(process.env.INNGEST_EVENT_KEY);
}

export const PROCESS_VIDEO_EVENT = 'flowzora/process-video';

export interface ProcessVideoEventData {
  jobId: string;
  userId: string;
  fileKey: string;
  filename: string;
  language: string;
  scriptPreference: string;
  billingJobId: string;
}

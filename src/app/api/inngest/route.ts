import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { processVideo } from '@/inngest/functions/process-video';

// Inngest executes each step in its own invocation; allow the max runtime.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processVideo],
});

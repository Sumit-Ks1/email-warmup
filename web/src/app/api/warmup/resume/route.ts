import { resumeWarmup } from '@/lib/warmup-engine';
import { warmupControlHandler } from '@/lib/warmup-routes';

export const dynamic = 'force-dynamic';

export const POST = warmupControlHandler(resumeWarmup, 'Warm-up session resumed');

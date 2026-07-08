import { startWarmup } from '@/lib/warmup-engine';
import { warmupControlHandler } from '@/lib/warmup-routes';

export const dynamic = 'force-dynamic';

export const POST = warmupControlHandler(startWarmup, 'Warm-up session started');

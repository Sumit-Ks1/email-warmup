import { accountCollectionHandlers } from '@/lib/account-routes';

export const dynamic = 'force-dynamic';

const handlers = accountCollectionHandlers('lead');
export const GET = handlers.GET;
export const POST = handlers.POST;

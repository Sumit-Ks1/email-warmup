import { accountItemHandlers } from '@/lib/account-routes';

export const dynamic = 'force-dynamic';

const handlers = accountItemHandlers('lead');
export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;

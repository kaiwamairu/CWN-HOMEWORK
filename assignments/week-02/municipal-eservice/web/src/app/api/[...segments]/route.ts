import { dispatch } from '../../../server/http/router.ts';
import { getContext } from '../../../server/http/context.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function handle(request:Request){return dispatch(request,getContext());}
export {handle as GET,handle as POST,handle as PUT,handle as PATCH,handle as DELETE,handle as OPTIONS,handle as HEAD};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export {
  optionsRequest as OPTIONS,
  notFoundRequest as GET,
  notFoundRequest as POST,
  notFoundRequest as PATCH,
  notFoundRequest as PUT,
  notFoundRequest as DELETE,
  notFoundRequest as HEAD,
} from '../../../core/system-request';

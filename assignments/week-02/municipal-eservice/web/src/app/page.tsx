import { redirect } from 'next/navigation';
import {pageSession} from '../server/page-session';
import {landFor} from '../server/domain/auth';
export const dynamic='force-dynamic';
export default async function Page(){const {actor}=await pageSession('/');redirect(actor?landFor(actor):'/login');}

import {pageSession} from '../../server/page-session';
import {RegistrationForm} from '../../components/RegistrationForm';
export const dynamic='force-dynamic';
export default async function Page(){const {actor}=await pageSession('/register');return <RegistrationForm name={actor!.name}/>;}

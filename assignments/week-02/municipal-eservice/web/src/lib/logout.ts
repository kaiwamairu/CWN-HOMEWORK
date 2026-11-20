export async function endSession(fetcher:typeof fetch=fetch):Promise<void>{
 try{const response=await fetcher('/api/auth/logout',{method:'POST'});if(response.status===204||response.status===401)return;}catch{/* Retain the local session view until the server confirms sign-out. */}
 throw new Error('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
}

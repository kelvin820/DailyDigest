export async function recoverClosedBrowser<T>(run:(attempt:number)=>Promise<T>,retry:(attempt:number)=>void=()=>{}){
 for(let attempt=0;attempt<2;attempt++){
  try{return await run(attempt);}catch(error){
   if(attempt||!(error instanceof Error)||!/Target (?:page|closed)|browser (?:has been closed|closed|disconnected)|page crashed/i.test(error.message))throw error;
   retry(attempt+1);
  }
 }
 throw Error('PDF_BROWSER_FAILED');
}

let previous=Promise.resolve();
export async function withPdfBrowserSlot<T>(run:()=>Promise<T>){
 const ahead=previous;let release!:()=>void;previous=new Promise<void>(resolve=>{release=resolve;});
 await ahead;try{return await run();}finally{release();}
}

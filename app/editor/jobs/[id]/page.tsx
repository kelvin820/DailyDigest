import Link from 'next/link';
import {z} from 'zod';
import {notFound} from 'next/navigation';
import {EditorGate} from '../../../../components/EditorGate';
import {WebJobReview} from '../../../../components/WebJobReview';
import {sourceLibrary} from '../../../../lib/editorial/library';
export const dynamic='force-dynamic';
export default async function JobPage({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();return <main className="review-room"><nav className="utility"><Link href="/editor">← 編輯室</Link><Link href="/">返回閱讀</Link></nav><EditorGate><WebJobReview id={id} choices={sourceLibrary.map(({id,category,label,publisher,url})=>({id,category,label,publisher,url}))}/></EditorGate></main>;}

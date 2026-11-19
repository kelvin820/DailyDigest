import {readingMode} from '../../lib/reader/mode.mjs';
import {pageMember} from '../../lib/auth/server';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {reviewPackets} from '../../lib/publications/catalog';
export const dynamic='force-dynamic';
export default async function ReviewHome(){if(readingMode()==='published')await pageMember(true);const latest=reviewPackets()[0];if(latest)redirect('/review/'+latest.id);return <main className="panel"><Link href="/">← 返回閱讀</Link><h1>出刊審查</h1><p>目前沒有新的待審刊物。新一期製作完成後會出現在這裡。</p></main>;}

import Link from 'next/link';
import {EditorGate} from '../../components/EditorGate';
import {EditorialDesk} from '../../components/EditorialDesk';
import {sourceChoices} from '../../lib/editorial/library';
import {taipeiDate} from '../../lib/content/metrics';
export const dynamic='force-dynamic';
export default function Editor(){const today=taipeiDate();return <main className="review-room"><nav className="utility"><Link href="/">← 返回閱讀</Link><Link href="/review">歷史審查區</Link><Link href="/issues">已出刊日曆</Link></nav><p className="eyebrow">DAYDAY EDITORIAL</p><h1>編輯室</h1><p>從來源到新一期，在這裡生成、審閱與發布。</p><EditorGate><EditorialDesk choices={sourceChoices(today)} today={today}/></EditorGate></main>;}

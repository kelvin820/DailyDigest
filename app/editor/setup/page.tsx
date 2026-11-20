import Link from 'next/link';
import {DatabaseSetup} from '../../../components/DatabaseSetup';
export const dynamic='force-dynamic';
export default function Setup(){return <main className="review-room"><nav className="utility"><Link href="/">← 返回閱讀</Link><Link href="/editor">編輯室</Link></nav><p className="eyebrow">DAYDAY SETUP</p><h1>連接新 Supabase</h1><p>先檢查 Vercel 已連接的新專案，再建立編輯室需要的資料結構。只對空專案初始化。</p><DatabaseSetup/></main>;}

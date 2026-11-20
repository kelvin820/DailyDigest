import {json} from '../api';
import {ZodError} from 'zod';

export function webError(error:unknown){
 const code=error instanceof Error?error.message:'REQUEST_FAILED';
 if(error instanceof ZodError||error instanceof SyntaxError)return json({error:'INVALID_REQUEST',message:'輸入格式不正確，請重新檢查。'},422);
 const messages:Record<string,string>={UNAUTHORIZED:'請先解鎖編輯室。',FORBIDDEN:'請從這個網站操作。',EDITOR_NOT_CONFIGURED:'管理密碼尚未生效，請確認 Vercel 已重新部署。',DATABASE_NOT_CONFIGURED:'資料庫設定尚未生效。',DATABASE_READ_FAILED:'無法讀取資料庫，請確認 Supabase 網址與服務金鑰屬於同一個專案。',DATABASE_WRITE_FAILED:'無法儲存至資料庫，請確認 Supabase 的資料表及服務金鑰設定。',LLM_NOT_CONFIGURED:'生成服務尚未設定。',RATE_LIMIT:'操作次數過多，請稍後再試。',NOT_FOUND:'找不到這個生成工作。',SOURCE_OUTSIDE_ISSUE_WINDOW:'選擇的來源超出這一期的日期範圍。',PUBLICATION_CHECKS_FAILED:'稿件、複核或 PDF 尚未全部通過，請先完成修訂。',REVIEW_VERSION_CHANGED:'審閱版本已改變，請重新載入。',NEWER_ISSUE_ALREADY_RELEASED:'同一天已有較新的刊物，不能用舊稿覆蓋。'};
 Object.assign(messages,{DATABASE_AUTH_FAILED:'Supabase 拒絕目前的服務憑證，請確認伺服器使用同一專案的 service role／secret key。',DATABASE_SCHEMA_MISSING:'Supabase 尚未找到既有的 app_settings 資料表，請確認指向原本已初始化的專案。',DATABASE_UNREACHABLE:'Vercel 目前無法連線 Supabase，請確認專案可用且網址正確。'});
 messages.DATABASE_PERMISSION_DENIED='資料庫已收到請求，但 service_role 缺少資料表權限；請補上既有 app_settings 表的伺服器角色權限，不需重跑初始化。';
 messages.DATABASE_NOT_SERVICE_KEY='目前設定不是 service_role／secret 的伺服器金鑰，請確認 Vercel 的 SUPABASE_SERVICE_ROLE_KEY。';
 Object.assign(messages,{SETUP_MARKETPLACE_REQUIRED:'尚未找到 Vercel Marketplace 的新 Supabase 設定。',SETUP_POSTGRES_NOT_CONFIGURED:'Vercel 尚未提供新庫的 PostgreSQL 連接字串，請確認整合已連到 Production。',SETUP_INVALID_PROJECT:'新 Supabase 的網址格式不正確。',SETUP_PROJECT_MISMATCH:'資料庫連接字串與 Supabase Project URL 不屬於同一專案，已停止初始化。',SETUP_DATABASE_NOT_EMPTY:'這個專案已有資料，已停止初始化並保留現有內容。',SETUP_TLS_FAILED:'資料庫憑證驗證失敗，請提供 Supabase 的伺服器 CA 憑證再重試。',SETUP_DATABASE_UNREACHABLE:'Vercel 無法連到 PostgreSQL，請確認新專案已啟動及整合連接字串有效。',SETUP_DATABASE_AUTH_FAILED:'PostgreSQL 拒絕連接憑證，請在 Vercel 重新同步這個 Supabase 整合。',SETUP_CONNECTION_FAILED:'目前無法檢查資料庫連接，請稍後再試。',SETUP_INITIALIZATION_FAILED:'初始化未完成，交易已回滾並保留原資料；請查看後端診斷。',SETUP_VERIFICATION_FAILED:'初始化後的檢查尚未通過，請保留紀錄並檢查。'});
 const status=code==='UNAUTHORIZED'?401:code==='FORBIDDEN'?403:code==='RATE_LIMIT'?429:code==='NOT_FOUND'?404:code.includes('NOT_CONFIGURED')||code.startsWith('DATABASE_')?503:409;
 if(status>=500)console.error('editorial_api_failed',{code:/^[A-Z_]+$/.test(code)?code:'REQUEST_FAILED'});
 return json({error:messages[code]?code:'REQUEST_FAILED',message:messages[code]||'這次操作未完成，請重新載入查看狀態。'},status);
}
export async function requestBody(req:Request){const text=await req.text();if(text.length>16000)throw Error('INVALID_REQUEST');return JSON.parse(text);}

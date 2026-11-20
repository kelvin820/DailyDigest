import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelStepTimings} from '../lib/editorial/web-timing';
test('timings pair completed model steps without counting accepted snapshots, PDF events or incomplete calls',()=>{
 const e=(seconds:number,message:string)=>({at:new Date(1700000000000+seconds*1000).toISOString(),message});
 assert.deepEqual(modelStepTimings([e(0,'開始寫稿 · elementary'),e(5,'完成 story:elementary:write:0'),e(6,'完成 story:elementary:accepted:0'),e(10,'開始修訂學習單字 · A1'),e(12,'完成 story:elementary:vocabulary:0'),e(20,'完成 小學版 彩色 PDF'),e(22,'開始模型複核 · A1')]),[{label:'寫稿',count:1,ms:5000},{label:'單字修訂',count:1,ms:2000}]);
});

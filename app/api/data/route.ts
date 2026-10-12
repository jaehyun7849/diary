import { env } from 'cloudflare:workers';
export const dynamic='force-dynamic';
const tables=['plans','revisions','tasks','logs','completions','reviews'];
function database(){if(!env.DB)throw new Error('DB unavailable');return env.DB;}
export async function GET(){try{const db=database();const result=await db.batch(tables.map(t=>db.prepare(`SELECT * FROM ${t}`)));return Response.json(Object.fromEntries(tables.map((t,i)=>[t,result[i].results])),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'자료를 불러오지 못했습니다. 잠시 후 다시 시도하세요.'},{status:503});}}
export async function POST(req:Request){try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'허용되지 않은 요청입니다.'},{status:403});
 const b=await req.json() as Record<string,any>;const db=database(),now=new Date().toISOString();
 const s=(v:unknown,max=3000)=>{if(typeof v!=='string'||v.length>max)throw Error('입력 내용을 확인하세요.');return v.trim();};
 const required=(v:unknown)=>{const x=s(v);if(!x)throw Error('필수 항목을 입력하세요.');return x;};
 const date=(v:unknown)=>{const x=s(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(x)||isNaN(Date.parse(x))||new Date(x).toISOString().slice(0,10)!==x)throw Error('날짜를 확인하세요.');return x;};
 const num=(v:unknown)=>{const n=Number(v);if(!Number.isInteger(n)||n<0||n>100000)throw Error('시간은 0~100000분의 정수로 입력하세요.');return n;};
 const priority=(v:unknown)=>{if(!['높음','보통','낮음'].includes(String(v)))throw Error('우선순위를 확인하세요.');return String(v);};
 const id=required(b.id);let queries:D1PreparedStatement[]=[];
 if(b.action==='plan'){
 const title=required(b.title),start=date(b.start),end=date(b.end),p=priority(b.priority),success=required(b.success),estimate=num(b.estimate),improvement=s(b.improvement??'');if(end<start)throw Error('종료일은 시작일 이후여야 합니다.');
 const old=await db.prepare('SELECT * FROM plans WHERE id=?').bind(id).first();
 if(old){if(old.version!==Number(b.version))return Response.json({error:'다른 곳에서 수정된 계획입니다. 새로고침 후 다시 수정하세요.'},{status:409});
 queries.push(db.prepare('INSERT INTO revisions(id,plan_id,snapshot,created) SELECT ?,id,?,? FROM plans WHERE id=? AND version=?').bind(crypto.randomUUID(),JSON.stringify(old),now,id,b.version));
 queries.push(db.prepare('UPDATE plans SET title=?,start=?,end=?,priority=?,success=?,estimate=?,improvement=?,version=version+1 WHERE id=? AND version=?').bind(title,start,end,p,success,estimate,improvement,id,b.version));
 }else{queries.push(db.prepare('INSERT INTO plans(id,title,start,end,priority,success,estimate,improvement,created,version) VALUES(?,?,?,?,?,?,?,?,?,1)').bind(id,title,start,end,p,success,estimate,improvement,now));
 if(b.starter){for(let i=0;i<5;i++){let d=new Date(start+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+[0,2,4,7,10][i]);const due=d.toISOString().slice(0,10);queries.push(db.prepare('INSERT INTO tasks(id,plan_id,title,due,priority,tag,estimate,created) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,i%2===0?'가볍게 걷기':'헬스장 운동하기',due>end?end:due,'보통',i%2===0?'걷기':'헬스',i%2===0?20:30,now));}}
 }
 }else if(b.action==='task'){
 const plan=required(b.plan_id);queries.push(db.prepare('INSERT INTO tasks(id,plan_id,title,due,priority,tag,estimate,created) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,due=excluded.due,priority=excluded.priority,tag=excluded.tag,estimate=excluded.estimate WHERE tasks.deleted=0').bind(id,plan,required(b.title),date(b.due),priority(b.priority),required(b.tag),num(b.estimate),now));
 }else if(['done','delete','log'].includes(b.action)){
 const task=await db.prepare('SELECT id FROM tasks WHERE id=? AND deleted=0').bind(b.action==='log'?required(b.task_id):id).first();if(!task)throw Error('할 일을 찾을 수 없습니다.');
 if(b.action==='done'){if(typeof b.done!=='boolean')throw Error('완료 상태를 확인하세요.');queries.push(db.prepare('UPDATE tasks SET done=? WHERE id=? AND deleted=0').bind(b.done?1:0,id));queries.push(b.done?db.prepare('INSERT INTO completions(task_id,created) SELECT id,? FROM tasks WHERE id=? AND deleted=0 ON CONFLICT(task_id) DO NOTHING').bind(now,id):db.prepare('DELETE FROM completions WHERE task_id=?').bind(id));}
 if(b.action==='delete'){queries.push(db.prepare('UPDATE tasks SET deleted=1 WHERE id=?').bind(id));}
 if(b.action==='log'){const start=required(b.start),end=required(b.end);if(!/(Z|[+-]\d\d:\d\d)$/.test(start)||!/(Z|[+-]\d\d:\d\d)$/.test(end)||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<Date.parse(start))throw Error('시작·종료 시각을 확인하세요.');queries.push(db.prepare('INSERT INTO logs(id,task_id,start,end,minutes,note,blocker,created) SELECT ?,id,?,?,?,?,?,? FROM tasks WHERE id=? AND deleted=0 ON CONFLICT(id) DO NOTHING').bind(id,new Date(start).toISOString(),new Date(end).toISOString(),num(b.minutes),s(b.note??''),s(b.blocker??''),now,b.task_id));}
 }else if(b.action==='review'){
 const start=date(b.start),end=date(b.end);if(start>end)throw Error('기간을 확인하세요.');const improvement=required(b.improvement),next=required(b.next_id),nextStart=date(b.next_start),nextEnd=date(b.next_end);if(nextStart>nextEnd)throw Error('다음 계획 기간을 확인하세요.');
 queries.push(db.prepare('INSERT INTO plans(id,title,start,end,priority,success,estimate,improvement,created,version) VALUES(?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id) DO NOTHING').bind(next,required(b.next_title),nextStart,nextEnd,'보통',improvement,0,improvement,now));
 queries.push(db.prepare('INSERT INTO reviews(id,plan_id,start,end,note,improvement,next_plan_id,created) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,required(b.plan_id),start,end,s(b.note??''),improvement,next,now));
 }else throw Error('지원하지 않는 요청입니다.');
 const result=await db.batch(queries);if(b.action==='plan'&&queries.length===2&&result[1].meta.changes===0)return Response.json({error:'계획이 변경되었습니다. 새로고침해 주세요.'},{status:409});
 return Response.json({ok:true});
 }catch(e){return Response.json({error:e instanceof Error&& !/SQL|D1|constraint|FOREIGN|UNIQUE/i.test(e.message)?e.message:'저장하지 못했습니다. 입력과 연결 상태를 확인하고 다시 시도하세요.'},{status:400});}}


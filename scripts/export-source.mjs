import fs from 'node:fs';
import path from 'node:path';
const paths=['app/page.tsx','app/layout.tsx','app/globals.css','app/api/data/route.ts','app/source/page.tsx','db/schema.ts','db/index.ts','lib/metrics.mjs','contracts/pds-schema-v2.json','README.md','package.json','vite.config.ts','drizzle.config.ts'];
for(const p of fs.readdirSync('drizzle'))if(p.endsWith('.sql'))paths.push('drizzle/'+p);
fs.mkdirSync('public',{recursive:true});
fs.writeFileSync('public/source-code.json',JSON.stringify({description:'한걸음 과제 앱의 주요 소스와 DB 명세. 전체 프로젝트는 로컬 전달본에 포함됩니다.',files:Object.fromEntries(paths.map(p=>[p,fs.readFileSync(p,'utf8')]))},null,2));
fs.copyFileSync('contracts/pds-schema-v2.json','public/pds-schema-v2.json');

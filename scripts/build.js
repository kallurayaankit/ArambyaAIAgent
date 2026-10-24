import {mkdir,copyFile,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const sources=['server.js','src/agent.js','src/planner.js','src/tools.js','src/provider.js','src/demo.js','public/app.js'];
for(const file of sources){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);}
const html=await readFile('public/index.html','utf8');if(!html.includes('/app.js')||!html.includes('/style.css'))throw new Error('UI entry assets missing.');
await mkdir('dist/public',{recursive:true});await mkdir('dist/src',{recursive:true});
for(const file of [...sources,'public/index.html','public/style.css','package.json'])await copyFile(file,'dist/'+file);
console.log('Build complete: dist/. Run node dist/server.js. No bundler or packages required.');

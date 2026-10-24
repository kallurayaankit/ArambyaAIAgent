import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const patterns=[/gh[pousr]_[A-Za-z0-9]{30,}/,/github_pat_[A-Za-z0-9_]{40,}/,/sk-proj-[A-Za-z0-9_-]{25,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/AKIA[0-9A-Z]{16}/];
let failures=0;
for(const file of files){if(/(^|\/)(\.env(?:\..*)?|test-results|\.sites-runtime|\.wrangler)(\/|$)/.test(file)){console.error('Excluded/private runtime path staged:',file);failures++;continue;}const data=readFileSync(file,'utf8');if(patterns.some(p=>p.test(data))){console.error('Credential-like material:',file);failures++;}}
console.log(`Audited ${files.length} tracked files; ${failures} credential/runtime findings. Heuristic scan plus manual review; not a security guarantee.`);if(failures)process.exitCode=1;

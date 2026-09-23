import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
export function releaseInputs() {
  const files=[];
  function walk(dir) { for(const e of readdirSync(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())walk(p);else if(e.isFile())files.push(p);} }
  for(const dir of ['src','tests','scripts','examples'])walk(dir);
  files.push('package.json','package-lock.json','vite.config.ts','vitest.config.ts','tsconfig.json','tsconfig.build.json','references.lock.json');
  return Object.fromEntries(files.sort().map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {load} from './helpers/load-ts.mjs';
const names=Object.values(load('src/components/protocol/guest-mobile.ts').default);
const dir=path.resolve('.next/static/chunks');
const files=fs.readdirSync(dir);
const css=files.filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n');
const js=files.filter(f=>f.endsWith('.js')).map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n');
for(const name of names){assert.ok(css.includes('.'+name),`Missing compiled selector: ${name}`);assert.ok(js.includes('"'+name+'"'),`Client bundle does not use selector: ${name}`);}
console.log(`PASS ${names.length} guest style names match actual compiled client and CSS artifacts.`);

import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const feature=resolve('../specs/001-municipal-eservice'),publicDir=resolve('public/illustrations');
const read=(path:string)=>readFileSync(path),hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const tokens=JSON.parse(read(resolve(feature,'design-tokens.json')).toString()) as {css:Record<string,string>};
const css=read(resolve('src/styles/tokens.css')).toString();assert.equal(css,read(resolve(feature,'design-tokens.css')).toString());
for(const [key,value] of Object.entries(tokens.css))assert.ok(css.includes(`--ds-${key}: ${value};`),`Token mismatch ${key}`);
const provenance=JSON.parse(read(resolve(publicDir,'provenance.json')).toString()) as {sha256:Record<string,string>};
for(const [file,expected] of Object.entries(provenance.sha256)){assert.equal(hash(read(resolve(publicDir,file))),expected);assert.equal(hash(read(resolve(feature,'design-assets/motion',file))),expected);}
assert.equal(hash(read(resolve(publicDir,'civic-illustrations.svg'))),hash(read(resolve(feature,'design-assets/civic-illustrations.svg'))));
console.log(JSON.stringify({tokenCount:Object.keys(tokens.css).length,mediaFiles:Object.keys(provenance.sha256).length,svgByteParity:true,selectedVariant:'C'}));

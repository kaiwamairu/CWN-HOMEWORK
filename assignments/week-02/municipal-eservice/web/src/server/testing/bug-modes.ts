export function parseBugModes(value:string|undefined):ReadonlySet<string>{
 const tokens=(value??'').split(',').map(s=>s.trim()).filter(Boolean);
 if(tokens.some(t=>!/^B(0[1-9]|1[0-2])$/.test(t)))throw new Error('Invalid BUG_MODE token');
 return new Set(tokens);
}

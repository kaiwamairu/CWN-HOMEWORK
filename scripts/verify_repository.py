"""Verify the imported homework without network calls or application mutations."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote

ROOT=Path(__file__).resolve().parents[1]
if os.name=='nt' and not str(ROOT).startswith('\\\\?\\'):
    ROOT=Path('\\\\?\\'+str(ROOT))
APP=ROOT/'assignments/week-02/municipal-eservice'
FEATURE=APP/'specs/001-municipal-eservice'
PLAN=ROOT/'docs/planning/egov-eservice'
checks=[]
def check(name,ok,detail=''):
    checks.append({'name':name,'passed':bool(ok),'detail':detail})
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

manifest=read(FEATURE/'source-manifest.json')
changed=[name for name,digest in manifest['files'].items() if not (APP/name).is_file() or sha(APP/name)!=digest]
check('Ten original assignment documents retain byte hashes',len(manifest['files'])==10 and not changed,str(changed))
token_json=read(FEATURE/'design-tokens.json')
token_css=(FEATURE/'design-tokens.css').read_bytes()
app_css=(APP/'web/src/styles/tokens.css').read_bytes()
check('Canonical 64 tokens and application CSS remain in parity',len(token_json['css'])==64 and token_css==app_css and all(f'--ds-{k}: {v};' in app_css.decode('utf-8') for k,v in token_json['css'].items()))
media=read(APP/'web/public/illustrations/provenance.json')['sha256']
bad_media=[name for name,digest in media.items() if sha(APP/'web/public/illustrations'/name)!=digest or sha(FEATURE/'design-assets/motion'/name)!=digest]
check('Approved media retain source and public byte hashes',len(media)==10 and not bad_media,str(bad_media))
check('Civic SVG parity',sha(APP/'web/public/illustrations/civic-illustrations.svg')==sha(FEATURE/'design-assets/civic-illustrations.svg'))
civic=(APP/'web/src/styles/civic.css').read_text(encoding='utf-8')
check('Preserved greeting fade and staff-login gap','transform:translateY(12px)' in civic and '#staff-login .field + .button{margin-top:20px}' in civic)
tasks=(FEATURE/'tasks.md').read_text(encoding='utf-8')
all_tasks=re.findall(r'^- \[[ x]\] (T\d{3})\b',tasks,re.M)
completed=re.findall(r'^- \[x\] (T\d{3})\b',tasks,re.M)
check('Source progress is exactly 20 of 78 tasks',len(all_tasks)==78 and len(set(all_tasks))==78 and completed==[f'T{x:03}' for x in range(1,21)])
inventory=read(FEATURE/'contracts/inventory.json')['cases']
check('51 canonical acceptance IDs remain unchanged',len(inventory)==51 and len({c['id'] for c in inventory})==51)
blocks=read(PLAN/'blocks.json')['blocks']; by={b['id']:b for b in blocks}
check('14 unique DAG blocks',len(blocks)==len(by)==14)
visited=set();active=set()
def visit(n):
    if n in active:raise ValueError('Cycle')
    if n in visited:return
    active.add(n)
    for dep in by[n]['depends_on']:visit(dep)
    active.remove(n);visited.add(n)
try:
    for n in by:visit(n)
    acyclic=True
except (ValueError,KeyError):acyclic=False
check('Valid acyclic block dependencies',acyclic)
check('Independent oracle writer and exclusive final block',not by['B02']['depends_on'] and blocks[-1]['id']=='B14' and blocks[-1]['exclusive'])
owners=[task for b in blocks for task in b['task_ids']]
check('Every task has one primary block owner',len(owners)==78 and set(owners)==set(all_tasks))
outputs=[out for b in blocks for out in b['outputs']]
check('Primary block output files are disjoint',len(outputs)==len(set(outputs)))
trace=read(PLAN/'traceability.json')
expected={f'{kind}-{i:02}' for kind,count in [('FR',29),('BR',29),('NFR',11)] for i in range(1,count+1)}
check('All 69 requirements have mapped tasks',len(trace['requirements'])==69 and {r['id'] for r in trace['requirements']}==expected and all(r['tasks'] and r['blocks'] for r in trace['requirements']))
checkpoint=read(PLAN/'source-checkpoint.json')
portable_source=(PLAN/checkpoint['source_root']).resolve()
check('Planning source root is portable',portable_source==APP.resolve())
state=read(APP/'.specify/feature.json.example')
check('Portable Spec Kit feature example',state.get('feature_directory')=='specs/001-municipal-eservice')

# Inspect only the files Git would publish; runtime created during checks stays ignored.
listing=subprocess.run(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=str(ROOT),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
if listing.returncode:raise RuntimeError('Could not list publication files')
paths=sorted(set(x.decode('utf-8') for x in listing.stdout.split(b'\0') if x))
forbidden=[];secret_hits=[];large=[]
private_patterns=[re.compile(rb'-----BEGIN (?:OPENSSH|RSA|EC|DSA|ENCRYPTED)?\s*PRIVATE KEY-----'),
                  re.compile(rb'\bsk-or-v1-[A-Za-z0-9]{40,}\b'),
                  re.compile(rb'\bgh[pousr]_[A-Za-z0-9]{30,}\b'),
                  re.compile(rb'\bgithub_pat_[A-Za-z0-9_]{40,}\b'),
                  re.compile(rb'\bAKIA[0-9A-Z]{16}\b')]
text_suffixes={'.md','.json','.py','.ps1','.sh','.ts','.tsx','.js','.mjs','.html','.css','.yaml','.yml','.toml','.txt'}
for rel in paths:
    p=Path(rel); file=ROOT/p
    if (p.name.startswith('.env') and p.name!='.env.example') or p.suffix in {'.pem','.key','.sqlite','.sqlite3','.db','.tsbuildinfo'} or any(part in {'node_modules','.next','dist','var','evidence','.ssh','__pycache__'} for part in p.parts):forbidden.append(rel)
    if file.stat().st_size>=100*1024*1024:large.append(rel)
    if p.suffix in text_suffixes:
        data=file.read_bytes()
        if any(pattern.search(data) for pattern in private_patterns):secret_hits.append(rel)
check('No private environment, keys, DB or runtime files selected',not forbidden,str(forbidden))
check('No recognizable private-key or service-token payloads',not secret_hits,str(secret_hits))
check('No file reaches the GitHub 100MiB limit',not large,str(large))
new_docs=['README.md','CONTRIBUTING.md','assignments/README.md','assignments/week-02/README.md',
          'assignments/week-02/municipal-eservice/PROJECT.md','docs/repository-structure.md',
          'docs/project-status.md','docs/planning/egov-eservice/README.md','docs/import-verification.md']
broken=[]
for rel in new_docs:
    source=ROOT/rel
    if not source.exists():broken.append(rel);continue
    for dest in re.findall(r'\]\(([^)]+)\)',source.read_text(encoding='utf-8')):
        if '://' in dest or dest.startswith('#'):continue
        target=(source.parent/unquote(dest.split('#')[0])).resolve()
        if not target.exists():broken.append(rel+' -> '+dest)
check('New repository entry-document links resolve',not broken,str(broken))
result={'kind':'repository-import-verification','passed':sum(x['passed'] for x in checks),
        'failed':sum(not x['passed'] for x in checks),'publication_files':len(paths),
        'publication_mib':round(sum((ROOT/p).stat().st_size for p in paths)/1048576,2),
        'checks':checks,'canonical_runtime_acceptance':'Still pending; this script does not run the application acceptance suite.'}
print(json.dumps(result,ensure_ascii=True,indent=2))
sys.exit(1 if result['failed'] else 0)

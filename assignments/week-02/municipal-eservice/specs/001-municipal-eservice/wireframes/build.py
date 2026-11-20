"""Build all 15 offline wireframes from the current canonical C design inputs."""
from pathlib import Path
import base64,hashlib,json,re,sys
sys.stdout.reconfigure(encoding='utf-8')
HERE=Path(__file__).resolve().parent
FEATURE=HERE.parent
read=lambda p:json.loads(p.read_text('utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
tokens=read(FEATURE/'design-tokens.json')
assets=read(FEATURE/'design-assets.json')
routes=read(HERE/'routes.json')
seed=read(HERE/'seed.json')
assert len(routes)==15 and len(seed['cases'])==30
assert tokens['decision']['selectedVariant']=='C'
source_template=(FEATURE/'design-examples/c-civic-story/template.html').read_text('utf-8-sig')
fades=re.findall(r'\.hero-copy(?:::|:)before\{([^}]*)\}',source_template)
assert len(fades)>=2,'Selected preview must define desktop and compact greeting fades'
sprite=re.search(r'<defs>([\s\S]*?)</defs>',source_template)[0]
scene=FEATURE/assets['scene']['webSource']
image='data:image/jpeg;base64,'+base64.b64encode(scene.read_bytes()).decode()
css=':root {\n'+''.join('  --ds-'+k+': '+v+';\n' for k,v in tokens['css'].items())+'}\n'
motion_dir=FEATURE/'design-assets/motion'
motion_manifest=read(motion_dir/'manifest.json')
scene_assets={**motion_manifest['assets'],**motion_manifest.get('login_illustrations',{})}
motion={key:dict(scene=key,src='../design-assets/motion/'+asset['video'] if asset.get('video') else '',poster='../design-assets/motion/'+asset['poster']) for key,asset in scene_assets.items()}
data=dict(routes=routes,seed=seed,motion=motion,tokenHash=sha(FEATURE/'design-tokens.json'),fade=dict(desktop=fades[0],compact=fades[-1]),source='CONTRACT.md / TEST-DATA.md; design wireframes only')
page=(HERE/'template.html').read_text('utf-8')
replacements={'__TOKENS_CSS__':css,'__MOTION_CSS__':(motion_dir/'civic-motion.css').read_text('utf-8'),'__MOTION_SCRIPT__':(motion_dir/'civic-motion.js').read_text('utf-8'),'__SCENE__':image,'__USER_FADE__':fades[0],'__USER_FADE_MOBILE__':fades[-1],'__SPRITE__':sprite,'__DATA__':json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('</','<\/'),'__CORE__':(HERE/'core.js').read_text('utf-8'),'__PAGES__':'\n'.join((HERE/n).read_text('utf-8') for n in ['pages-public.js','pages-staff.js','pages-admin.js']),'__ACTIONS__':(HERE/'actions.js').read_text('utf-8')}
for marker,value in replacements.items():
 assert marker in page,marker
 page=page.replace(marker,value)
assert all(marker not in page for marker in replacements)
assert '100vh' not in page
size=len(page.encode('utf-8'))
assert size<512*1024,f'Inline artifact exceeds budget: {size}'
(HERE/'index.html').write_text(page,encoding='utf-8')
sources=['design-tokens.json','design-assets.json','design-examples/c-civic-story/template.html',assets['scene']['webSource']]
sources += [p.relative_to(FEATURE).as_posix() for p in sorted(motion_dir.iterdir()) if p.is_file()]
manifest={'page_patterns':15,'root_redirect':True,'wireframe_only':True,'canonical_application_tests_run':0,'sources':{n:sha(FEATURE/n) for n in sources},'wireframe_sources':{n:sha(HERE/n) for n in ['template.html','core.js','pages-public.js','pages-staff.js','pages-admin.js','actions.js','routes.json','seed.json']},'bytes':(HERE/'index.html').stat().st_size}
(HERE/'build-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'pages':15,'bytes':size,'seed_cases':len(seed['cases']),'fade':fades[0].split(';')[0],'token_hash':data['tokenHash']},ensure_ascii=False))

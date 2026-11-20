"""Build the offline civic-story example; Python standard library only."""
from pathlib import Path
import base64,re,json,shutil

HERE=Path(__file__).resolve().parent
FEATURE=HERE.parents[1]
tokens=json.loads((FEATURE/'design-tokens.json').read_text('utf-8-sig'))
assert tokens['decision']['selectedVariant']=='C'
css='/* Generated from design-tokens.json; selected C / Illustrated Civic Service. */\n:root {\n'+''.join('  --ds-'+k+': '+v+';\n' for k,v in tokens['css'].items())+'}\n'
(FEATURE/'design-tokens.css').write_text(css,encoding='utf-8')
shutil.copy2(FEATURE/'design-tokens.json',HERE/'design-tokens.json')
manifest=json.loads((FEATURE/'design-assets.json').read_text('utf-8-sig'))
motion_dir=FEATURE/'design-assets/motion'
motion_manifest=json.loads((motion_dir/'manifest.json').read_text('utf-8'))
motion={key:dict(scene=key,src='__MOTION_BASE__/'+asset['video'],poster='__MOTION_BASE__/'+asset['poster']) for key,asset in motion_manifest['assets'].items()}
scene_source=FEATURE/manifest['scene']['webSource']
template=(HERE/'template.html').read_text('utf-8')
image='data:image/jpeg;base64,'+base64.b64encode(scene_source.read_bytes()).decode()
page=template.replace('__HERO_DATA__',image).replace('__SCRIPT__',(HERE/'preview.js').read_text('utf-8'))
page=page.replace('__MOTION_CSS__',(motion_dir/'civic-motion.css').read_text('utf-8')).replace('__MOTION_SCRIPT__',(motion_dir/'civic-motion.js').read_text('utf-8')).replace('__MOTION_DATA__',json.dumps(motion,ensure_ascii=False))
page=page.replace('<style>','<style>\n'+css,1)
assert len(page.encode('utf-8'))<512*1024
assert not any(x in page for x in ['__SCRIPT__','__HERO_DATA__','pointermove','mousemove','100vh'])
(HERE/'index.html').write_text(page.replace('__MOTION_BASE__','../../design-assets/motion'),encoding='utf-8')
(FEATURE/'design-preview.html').write_text(page.replace('__MOTION_BASE__','design-assets/motion'),encoding='utf-8')
sprite=re.search(r'<svg class="icon-defs"[\s\S]*?</svg>',template)[0]
(HERE/'illustrations.svg').write_text(sprite.replace('class="icon-defs" ','').replace('aria-hidden="true"',''),encoding='utf-8')
assets=FEATURE/'design-assets'
assets.mkdir(exist_ok=True)
shutil.copy2(HERE/'illustrations.svg',assets/'civic-illustrations.svg')
shutil.copy2(scene_source,FEATURE/manifest['scene']['path'])
print(f'Built {len(page.encode("utf-8"))} bytes')

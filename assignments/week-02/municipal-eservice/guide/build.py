"""Build the offline Thai documentation atlas. Standard library only."""
from pathlib import Path
import html,json,re,zipfile,sys,shutil
sys.dont_write_bytecode=True
from urllib.parse import unquote
from flow_content import FLOWS
sys.stdout.reconfigure(encoding='utf8')
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
FEATURE=ROOT/'specs/001-municipal-eservice'

DOCUMENTS=[
('auth-review','ผลตรวจเข้าสู่ระบบและลงทะเบียน','AUTHENTICATION REVIEW','specs/001-municipal-eservice/auth/verification-20261118.md','ผลทดสอบแอป'),
('foundation-review','ผลตรวจโครงแอปและฐานข้อมูล','FOUNDATION REVIEW','specs/001-municipal-eservice/foundation/verification-20261118.md','ผลทดสอบ foundation'),
('app-quickstart','เปิดแอปและตรวจพื้นฐาน','APP QUICKSTART','web/README.md','วิธีใช้งานแอป'),
('todo','รายการงานและขั้นตอนถัดไป','TO-DO LIST','specs/001-municipal-eservice/TODO.md','เอกสาร Spec Kit'),
('wireframe-review','ผลตรวจ flow และหน้าจอล่าสุด','WIREFRAME REVIEW','specs/001-municipal-eservice/wireframes/review-20261118.md','ผลทบทวนเอกสาร'),
('takeover','บันทึกรับช่วงงาน','TAKEOVER','TAKEOVER.md','เอกสาร Spec Kit'),
('constitution','หลักการและขอบเขต','CONSTITUTION','.specify/memory/constitution.md','เอกสาร Spec Kit'),
('spec','ข้อกำหนดและ User stories','SPECIFICATION','specs/001-municipal-eservice/spec.md','เอกสาร Spec Kit'),
('plan','แผนออกแบบและสถาปัตยกรรม','IMPLEMENTATION PLAN','specs/001-municipal-eservice/plan.md','เอกสาร Spec Kit'),
('design-system','หน้าตาและวัสดุที่เลือก','DESIGN SYSTEM','specs/001-municipal-eservice/design-system.md','เอกสาร Spec Kit'),
('wireframes','Wireframe C — ทุกหน้า','15-PAGE WIREFRAMES','specs/001-municipal-eservice/wireframes/README.md','เอกสาร Spec Kit'),
('ui-layouts','15 หน้าหลักและ Layout','UI LAYOUTS','specs/001-municipal-eservice/contracts/ui-layouts.md','เอกสาร Spec Kit'),
('design-tokens','Design token — C เมืองแห่งบริการ','DESIGN TOKENS','specs/001-municipal-eservice/design-tokens.json','เอกสาร Spec Kit'),
('research','เหตุผลและการค้นคว้า','RESEARCH','specs/001-municipal-eservice/research.md','เอกสาร Spec Kit'),
('data-model','แบบจำลองข้อมูลและสถานะ','DATA MODEL','specs/001-municipal-eservice/data-model.md','เอกสาร Spec Kit'),
('interfaces','สัญญาและ API เสริม','INTERFACES','specs/001-municipal-eservice/contracts/interface-map.md','เอกสาร Spec Kit'),
('quickstart','วิธีพัฒนาและตรวจรับ','QUICKSTART','specs/001-municipal-eservice/quickstart.md','เอกสาร Spec Kit'),
('tasks','งานพัฒนาทั้ง 78 งาน','TASKS','specs/001-municipal-eservice/tasks.md','เอกสาร Spec Kit'),
('traceability','ความครอบคลุมข้อกำหนด','TRACEABILITY','specs/001-municipal-eservice/traceability.md','เอกสาร Spec Kit'),
('requirements-check','ตรวจคุณภาพ Specification','SPEC CHECKLIST','specs/001-municipal-eservice/checklists/requirements.md','ผลทบทวนเอกสาร'),
('design-check','ผลทบทวนการออกแบบ','DESIGN REVIEW','specs/001-municipal-eservice/checklists/design-review.md','ผลทบทวนเอกสาร'),
('source-readme','แนะนำชุดโจทย์','README','README.md','โจทย์ต้นฉบับ'),
('source-brief','โจทย์จากผู้สอน','INSTRUCTOR BRIEF','brief/BRIEF.md','โจทย์ต้นฉบับ'),
('source-stories','User stories ต้นทาง','USER-STORIES','USER-STORIES.md','โจทย์ต้นฉบับ'),
('source-requirements','FR / BR / NFR ฉบับต้นทาง','REQUIREMENTS','REQUIREMENTS.md','โจทย์ต้นฉบับ'),
('source-decisions','กติกาหลักและคำตัดสิน','DECISIONS','DECISIONS.md','โจทย์ต้นฉบับ'),
('source-contract','เส้นทาง หน้าจอ API และข้อความ','CONTRACT','CONTRACT.md','โจทย์ต้นฉบับ'),
('source-testdata','ข้อมูลตั้งต้นและค่าที่คาดหวัง','TEST-DATA','TEST-DATA.md','โจทย์ต้นฉบับ'),
('source-testplan','ขั้นตอนตรวจรับทั้ง 51 TC','TEST-PLAN','TEST-PLAN.md','โจทย์ต้นฉบับ'),
('source-bugs','B01–B12 และผลที่ต้องจับได้','BUGS','BUGS.md','โจทย์ต้นฉบับ'),
('source-prompts','พรอมต์ดำเนินงานทีละขั้น','PROMPTS','PROMPTS.md','โจทย์ต้นฉบับ')]
PATH_IDS={(ROOT/row[3]).resolve():row[0] for row in DOCUMENTS}
PATH_IDS[(FEATURE/'contracts').resolve()]='interfaces'
PATH_IDS[(FEATURE/'checklists').resolve()]='design-check'

def inline(text,source):
    tokens=[]
    def save(value):tokens.append(value);return f'\x02{len(tokens)-1}\x03'
    text=re.sub(r'`([^`]+)`',lambda m:save('<code>'+html.escape(m[1])+'</code>'),text)
    text=re.sub(r'!\[([^\]]*)\]\(([^)]+)\)',lambda m:save('<span class="file-ref">'+html.escape(m[1] or 'ภาพประกอบในต้นฉบับ')+'</span>'),text)
    def link(m):
        label,url=m[1],m[2]
        if re.match(r'^https?://',url):return save('<a href="'+html.escape(url,quote=True)+'" target="_blank" rel="noopener noreferrer">'+html.escape(label)+'</a>')
        if url.startswith('#'):return save('<span class="file-ref">'+html.escape(label)+'</span>')
        raw=unquote(url.split('#')[0])
        if raw.startswith('file:///'):raw=raw[8:]
        path=(source.parent/raw).resolve() if not re.match(r'^[A-Za-z]:',raw) else Path(raw).resolve()
        docid=PATH_IDS.get(path)
        if docid:return save('<a href="#documents" data-doc="'+docid+'">'+html.escape(label)+'</a>')
        if path==(FEATURE/'foundation/verification-20261118.json').resolve():return save('<a href="documents/foundation-verification-20261118.json" download>'+html.escape(label)+'</a>')
        if path==(FEATURE/'auth/verification-20261118.json').resolve():return save('<a href="documents/auth-verification-20261118.json" download>'+html.escape(label)+'</a>')
        if path==(FEATURE/'wireframes/index.html').resolve():return save('<a href="wireframes/index.html" target="_blank" rel="noopener noreferrer">'+html.escape(label)+'</a>')
        if path==(FEATURE/'design-preview.html').resolve():return save('<a href="design-preview.html" target="_blank" rel="noopener noreferrer">'+html.escape(label)+'</a>')
        return save('<span class="file-ref" title="'+html.escape(raw,quote=True)+'">'+html.escape(label)+'</span>')
    text=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',link,text)
    text=html.escape(text)
    text=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',text)
    text=re.sub(r'(?<!\*)\*([^*\n]+)\*(?!\*)',r'<em>\1</em>',text)
    text=re.sub(r'~~(.+?)~~',r'<del>\1</del>',text)
    # Tokens may nest, e.g. a code label inside a link. Restore until none remain.
    for _ in range(5):
        if '\x02' not in text:break
        text=re.sub('\x02(\d+)\x03',lambda m:tokens[int(m[1])],text)
    return text

def cells(line):
    line=line.strip()
    if line.startswith('|'):line=line[1:]
    if line.endswith('|'):line=line[:-1]
    result=[];current='';code=False;escaped=False
    for c in line:
        if escaped:current+=c;escaped=False;continue
        if c=='\\':escaped=True;current+=c;continue
        if c=='`':code=not code
        if c=='|' and not code:result.append(current.strip());current=''
        else:current+=c
    result.append(current.strip());return result

def render(md,source,docid):
    md=re.sub(r'<!--[\s\S]*?-->','',md)
    lines=md.splitlines();out=[];i=0;heading=0
    special=lambda s:bool(re.match(r'^\s*(?:#{1,6}\s|```|~~~|\| |>|[-*+]\s|\d+\.\s|---\s*$)',s))
    while i<len(lines):
        l=lines[i].rstrip()
        if not l.strip():i+=1;continue
        if re.match(r'^\s*(```|~~~)',l):
            fence=re.match(r'^\s*(```|~~~)(.*)',l);lang=fence[2].strip();i+=1;code=[]
            while i<len(lines) and not lines[i].lstrip().startswith(fence[1]):code.append(lines[i]);i+=1
            out.append('<pre'+(' aria-label="แผนภาพต้นฉบับ Mermaid"' if lang=='mermaid' else '')+'><code>'+html.escape('\n'.join(code))+'</code></pre>');i+=1;continue
        m=re.match(r'^(#{1,6})\s+(.+)',l)
        if m:
            heading+=1;level=min(len(m[1])+1,6)
            out.append(f'<h{level} id="{docid}-h{heading}">'+inline(m[2],source)+f'</h{level}>');i+=1;continue
        if l.lstrip().startswith('|') and i+1<len(lines) and re.match(r'^\s*\|?\s*:?-{3}',lines[i+1]):
            headers=cells(l);i+=2;rows=[]
            while i<len(lines) and lines[i].lstrip().startswith('|'):rows.append(cells(lines[i]));i+=1
            out.append('<div class="table-scroll" tabindex="0" role="region" aria-label="ตารางเลื่อนอ่านแนวนอนได้"><table><thead><tr>'+''.join('<th scope="col">'+inline(c,source)+'</th>' for c in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+inline(c,source)+'</td>' for c in row)+'</tr>' for row in rows)+'</tbody></table></div>');continue
        if l.startswith('>'):
            quote=[]
            while i<len(lines) and lines[i].startswith('>'):quote.append(re.sub(r'^>\s?','',lines[i]));i+=1
            out.append('<blockquote>'+render('\n'.join(quote),source,docid+'-quote')+'</blockquote>');continue
        if re.match(r'^\s*(?:---+|\*\*\*+)\s*$',l):out.append('<hr>');i+=1;continue
        if re.match(r'^\s*(?:[-*+] |\d+\. )',l):
            ordered=bool(re.match(r'^\s*\d+\. ',l));tag='ol' if ordered else 'ul';items=[]
            while i<len(lines) and re.match(r'^\s*(?:[-*+] |\d+\. )',lines[i]):
                item=re.sub(r'^\s*(?:[-*+] |\d+\. )','',lines[i]);i+=1
                while i<len(lines) and lines[i].strip() and not special(lines[i]):item+=' '+lines[i].strip();i+=1
                box=re.match(r'^\[([ xX])\]\s*(.*)',item)
                if box:item=('<span class="checkmark" aria-label="'+('ตรวจแล้ว' if box[1].lower()=='x' else 'ยังไม่ทำ')+'">'+('☑' if box[1].lower()=='x' else '☐')+'</span>')+inline(box[2],source)
                else:item=inline(item,source)
                items.append('<li>'+item+'</li>')
            out.append('<'+tag+'>'+''.join(items)+'</'+tag+'>');continue
        para=[l.strip()];i+=1
        while i<len(lines) and lines[i].strip() and not special(lines[i]):para.append(lines[i].strip());i+=1
        out.append('<p>'+inline(' '.join(para),source)+'</p>')
    return '\n'.join(out)

TITLES=[
'ตั้งโปรเจกต์และล็อก dependencies','ตั้งค่า runner และรายงานตรวจรับ','เตรียมบัญชี reset และไฟล์ทดสอบ','กำหนด schema และข้อจำกัดข้อมูล','เข้ารหัสตัวตนและเก็บสามหลักท้าย','ทำ Clock และปฏิทินวันทำการ','แยก policy และข้อมูลตอบกลับตามสิทธิ์','สร้าง Audit writer แบบเพิ่มอย่างเดียว','เตรียม SQLite และข้อมูล seed ตายตัว','ทำ API dispatcher และข้อความผิดพลาด','ประเมิน lifecycle ก่อนทุก HTTP request','ทำ test hooks และสวิตช์ B01–B12','ทดสอบ rollback reset และ policy',
'เขียนเกณฑ์ AUTH และ RBAC','ทำ ThaiD จำลองและกติกา OTP','สร้าง session และสิทธิ์ตามรอบ login','ทำหน้า login และหน้าตั้งต้นแต่ละบทบาท','เขียนเกณฑ์ลงทะเบียน','บันทึกข้อมูลและความยินยอม','ทำหน้าลงทะเบียนครั้งแรก','เขียนเกณฑ์ราคาและการยื่น','คำนวณค่าธรรมเนียมสามบริการ','บันทึก เปิดแก้ และลบร่าง','ทำหน้าแคตตาล็อกและร่างคำขอ','เขียนเกณฑ์ไฟล์แนบและความครบ','ตรวจชนิด ขนาด และจำนวนไฟล์','เชื่อม upload และลบไฟล์แบบ atomic','ทำช่องแนบและแจ้งเอกสารที่ขาด','เขียนเกณฑ์ชำระเงินและการแข่งขัน','ล็อกยอดและอายุ QR','รับชำระพร้อมออกเลขใน transaction','ทำหน้า QR ใบเสร็จและผลชำระ','เขียนเกณฑ์ติดตาม แก้ไข และยกเลิก','คุมสิทธิ์รายการและการยกเลิก','ส่งแก้ คืนผู้ถือ และขยาย SLA','ทำหน้าคำขอฝั่งประชาชน','เขียนเกณฑ์คิวและรับเรื่อง','อ่านคิวตามแผนกและลำดับ','รับเรื่องแบบผู้ถือคนเดียว','ทำหน้าคิวและตัวกรอง','เขียนเกณฑ์ review privacy และไฟล์','ตีกลับและส่งต่อตามเส้นทาง','ตรวจสิทธิ์เปิดและดาวน์โหลดไฟล์','ปิดบังและเปิดเผยเลขพร้อม UNMASK','ทำหน้าตรวจเอกสารของเจ้าหน้าที่','เขียนเกณฑ์ SLA และ notification','คำนวณกำหนดและระดับเตือน','เลือกผู้รับและกันแจ้งเตือนซ้ำ','ทำกระดิ่งและหน้าการแจ้งเตือน','เชื่อม lifecycle กับเหตุการณ์จริง','เขียนเกณฑ์การอนุมัติตามอำนาจ','อนุมัติและปฏิเสธตามบริการ','ทำหน้ารออนุมัติของหัวหน้า','ผูกการตัดสินกับ Audit และเวลา','เขียนเกณฑ์ PDF และ verify','คำนวณอายุ รหัส และลายเซ็นจำลอง','ออกเอกสารและปิดงานแบบ atomic','สร้าง PDF และ API ตรวจเอกสาร','ทำหน้า verify สาธารณะ','เขียนเกณฑ์ Dashboard และ export','คำนวณ KPI ตามนิยามเดียวกัน','ส่งออก Excel และ PDF ตรงหน้าจอ','ทำ Dashboard และตัวกรอง','เขียนเกณฑ์ Audit และ CSV','กรอง Audit และส่งออก snapshot','ทำหน้าประวัติสำหรับผู้ตรวจสอบ','เขียนเกณฑ์การตั้งค่าผู้ดูแล','แก้บริการและวันหยุดตามขอบเขต','แก้บทบาทโดยมีผลเมื่อ login ใหม่','ทำหน้าตั้งค่าบริการ วันหยุด ผู้ใช้','ตรวจ responsive accessibility และ health','สร้างตัวตรวจ encryption at rest แยก','ผูก NFR-04 กับ acceptance runner','ทดสอบขอบเวลา การปัด และ rollback','รัน campaign โดยควบคุม server เอง','เทียบ failure sets ของ mutation','เก็บหลักฐานตรวจรับที่รันจริง','เขียนวิธีใช้งาน ผลตรวจและ open items']
assert len(TITLES)==78,len(TITLES)

def get_tasks():
    records=[]
    for line in (FEATURE/'tasks.md').read_text(encoding='utf8').splitlines():
        m=re.match(r'^- \[([ xX])\] (T\d{3})(?: \[P\])?(?: \[US(\d+)\])? (.*)',line)
        if m:records.append(dict(id=m[2],done=m[1].lower()=='x',story=int(m[3]) if m[3] else None,description=m[4],title=TITLES[int(m[2][1:])-1]))
    assert len(records)==78
    return records

def static_svg(f,css):
    esc=html.escape;N=240;H=76;nodes={n['id']:n for n in f['nodes']};parts=[]
    for e in f['edges']:
        a,b=nodes[e['from']],nodes[e['to']];ax,ay=a['x']+120,a['y']+38;bx,by=b['x']+120,b['y']+38
        if e.get('path'):p=e['path'];lx=e['labelX'];ly=e['labelY']
        elif e.get('arc'):
            top=max(12,min(a['y'],b['y'])-35);p=f'M {ax} {a["y"]} C {ax} {top},{bx} {top},{bx} {b["y"]}';lx=(ax+bx)/2;ly=max(10,top-5)
        elif abs(a['y']-b['y'])<12:
            right=b['x']>a['x'];sx=a['x']+N if right else a['x'];tx=b['x'] if right else b['x']+N;p=f'M {sx} {ay} L {tx} {by}';lx=(sx+tx)/2;ly=ay-9
        else:
            down=b['y']>a['y'];sy=a['y']+H if down else a['y'];ty=b['y'] if down else b['y']+H;my=(sy+ty)/2;p=f'M {ax} {sy} C {ax} {my},{bx} {my},{bx} {ty}';lx=(ax+bx)/2;ly=my-7
        parts.append(f'<path class="edge" d="{p}" marker-end="url(#arrow)"/>')
        if e.get('label'):parts.append(f'<text class="edge-label" x="{lx}" y="{ly}" text-anchor="middle">{esc(e["label"])}</text>')
    for i,n in enumerate(f['nodes'],1):
        parts.append(f'<g class="node {n.get("kind","")}" transform="translate({n["x"]},{n["y"]})"><title>{esc(n["label"])}</title><rect width="240" height="76" rx="7"/><text class="node-index" x="14" y="17">{i:02}</text><circle class="node-dot" cx="223" cy="15" r="3"/><text class="node-title" x="14" y="39">{esc(n["label"])}</text><text class="node-sub" x="14" y="59">{esc(n["sub"])}</text></g>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f["width"]} {f["height"]}" role="img" aria-label="{esc(f["title"],quote=True)}"><title>{esc(f["title"])}</title><desc>{esc(f["description"])}</desc><style>{css}</style><rect width="100%" height="100%" fill="#fbfcf8"/><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9fae98"/></marker></defs>'+''.join(parts)+'</svg>'

def build():
    (HERE/'wireframes').mkdir(exist_ok=True)
    for name in ['index.html','routes.json','README.md','screens.md','verification.json','motion-integration-verification.json','build-manifest.json','review-20261118.md','review-20261118.json','review-flows.js','review-extended-flows.js','review-pages.js','review-media.js']:
        source=FEATURE/'wireframes'/name
        if source.exists():shutil.copy2(source,HERE/'wireframes'/name)
    for name in ['design-preview.html','design-tokens.json','design-tokens.css','design-assets.json']:
        shutil.copy2(FEATURE/name,HERE/name)
    asset_manifest=json.loads((FEATURE/'design-assets.json').read_text(encoding='utf-8-sig'))
    art_paths=[asset_manifest['scene']['path'],asset_manifest['sprite']]
    motion_dir=FEATURE/'design-assets/motion'
    if motion_dir.exists():art_paths += [p.relative_to(FEATURE).as_posix() for p in motion_dir.iterdir() if p.is_file()]
    for relative in art_paths:
        target=HERE/relative
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(FEATURE/relative,target)
    template=(HERE/'template.html').read_text(encoding='utf8')
    docs=[]
    for id,title,short,path,group in DOCUMENTS:
        source=ROOT/path;md=source.read_text(encoding='utf-8-sig')
        if source.suffix=='.json':md='# Design tokens — C / เมืองแห่งบริการ\n\n```json\n'+md+'\n```'
        docs.append(dict(id=id,title=title,short=short,filename=path,group=group,source=group=='โจทย์ต้นฉบับ',html=render(md,source,id)))
    tasks=get_tasks()
    for edition,filename,items in [('full','index.html',docs),('inline','preview.html',[d for d in docs if not d['source']])]:
        payload=json.dumps(dict(edition=edition,docs=items,flows=FLOWS,tasks=tasks),ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
        output=template.replace('__DATA__',payload)
        (HERE/filename).write_text(output,encoding='utf8')
    css=re.search(r'<style>([\s\S]*?)</style>',template)[1]
    svgcss=re.search(r"const styleSVG='([^']+)';",template)[1]
    (HERE/'flows').mkdir(exist_ok=True)
    for f in FLOWS:(HERE/'flows'/f'{f["id"]}.svg').write_text(static_svg(f,svgcss),encoding='utf8')
    (HERE/'flows.json').write_text(json.dumps(FLOWS,ensure_ascii=False,indent=2),encoding='utf8')
    md=['# User flows · e-Service เทศบาลนครตัวอย่าง','','แผนภาพสรุปจากเอกสารโจทย์และ Spec Kit; ยังไม่ใช่ผลการรันระบบจริง','']
    for f in FLOWS:
        md += ['## '+f['title'],'',f['description'],'',f'![{f["title"]}](flows/{f["id"]}.svg)','','| ขั้น | บทบาท / หน้าจอ | สถานะและเงื่อนไข | เกณฑ์ทดสอบ |','| --- | --- | --- | --- |']
        for n in f['nodes']:md.append('| '+n['label']+' | '+n['actor']+' · `'+n['route'].replace('|',' / ')+'` | '+n['state']+' · '+'; '.join(n['rules'])+' | '+' '.join(n['tests'])+' |')
        md+=['','เส้นเชื่อม: '+', '.join(e['from']+' → '+e['to']+(' ('+e['label']+')' if e['label'] else '') for e in f['edges']),'']
    (HERE/'userflows.md').write_text('\n'.join(md),encoding='utf8')
    (HERE/'source-documents').mkdir(exist_ok=True)
    (HERE/'documents').mkdir(exist_ok=True)
    for d in docs:
        source=ROOT/d['filename']
        content=source.read_bytes()
        # Derived Markdown is downloaded from documents/, so rebase its known links.
        # Instructor originals retain exact source bytes.
        if not d['source'] and source.suffix=='.md':
            def rebase(m):
                label,url=m[1],m[2]
                if re.match(r'^(https?://|#)',url):return m[0]
                target=(source.parent/unquote(url.split('#')[0])).resolve()
                docid=PATH_IDS.get(target)
                if docid:
                    suffix=Path(next(item['filename'] for item in docs if item['id']==docid)).suffix
                    return '['+label+']('+docid+suffix+')'
                if target==(FEATURE/'foundation/verification-20261118.json').resolve():return '['+label+'](foundation-verification-20261118.json)'
                if target==(FEATURE/'auth/verification-20261118.json').resolve():return '['+label+'](auth-verification-20261118.json)'
                if target==(FEATURE/'wireframes/index.html').resolve():return '['+label+'](../wireframes/index.html)'
                return m[0]
            content=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',rebase,content.decode('utf-8')).encode('utf-8')
        (HERE/'documents'/(d['id']+source.suffix)).write_bytes(content)
        if d['source']:
            page='<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(d['title'])+'</title><style>'+css+'.standalone{max-width:1200px;margin:auto;padding:30px}.doc-content{padding:20px 0}body{background:var(--background,#f6f7f3)}</style><body><main class="guide standalone"><a class="button" href="../index.html?doc='+d['id']+'#documents">← กลับไปคู่มือ</a><article class="doc-content">'+d['html']+'</article><a class="button" href="../documents/'+d['id']+'.md" download>เก็บต้นฉบับ Markdown</a></main><script>document.querySelectorAll("[data-doc]").forEach(a=>a.href="../index.html?doc="+a.dataset.doc+"#documents")</script></body></html>'
            (HERE/'source-documents'/(d['id']+'.html')).write_text(page,encoding='utf8')
    shutil.copyfile(FEATURE/'foundation/verification-20261118.json',HERE/'documents/foundation-verification-20261118.json')
    shutil.copyfile(FEATURE/'auth/verification-20261118.json',HERE/'documents/auth-verification-20261118.json')
    preview_size=(HERE/'preview.html').stat().st_size
    if preview_size>=512*1024:raise ValueError(f'Inline edition too large: {preview_size}')
    with zipfile.ZipFile(HERE/'guide.zip','w',zipfile.ZIP_DEFLATED) as z:
        selected=[HERE/'index.html',HERE/'README.md',HERE/'userflows.md',HERE/'flows.json']
        if (HERE/'verification.json').exists():selected.append(HERE/'verification.json')
        selected+=list((HERE/'flows').glob('*.svg'))+list((HERE/'documents').glob('*.md'))+list((HERE/'documents').glob('*.json'))+list((HERE/'source-documents').glob('*.html'))
        selected+=list((HERE/'wireframes').glob('*'))
        selected+=[HERE/'design-preview.html',HERE/'design-tokens.json',HERE/'design-tokens.css',HERE/'design-assets.json']
        selected+=[HERE/relative for relative in art_paths]
        for p in selected:z.write(p,p.relative_to(HERE).as_posix())
    print(json.dumps({'full_bytes':(HERE/'index.html').stat().st_size,'inline_bytes':preview_size,'documents':len(docs),'inline_documents':sum(not d['source'] for d in docs),'flows':len(FLOWS),'nodes':sum(len(f['nodes']) for f in FLOWS),'tasks':len(tasks),'zip_bytes':(HERE/'guide.zip').stat().st_size},indent=2))

if __name__=='__main__':build()

from pathlib import Path
import hashlib,html,json,shutil,struct,zipfile
HERE=Path(__file__).resolve().parent
data=json.loads((HERE/'prompts.json').read_text('utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
records=[];markdown=['# Google Flow — Motion prompts','','ใช้ภาพที่ตรงกับรหัสเป็น start frame และคัดลอก prompt ด้านล่าง','']
for scene in data['scenes']:
 source=HERE.parent/'civic-motion-20261116'/(scene['id']+'-approved.png')
 target=HERE/scene['file'];shutil.copy2(source,target)
 assert sha(source)==sha(target)
 assert struct.unpack('>II',target.read_bytes()[16:24])==(1122,1402)
 (HERE/(scene['id']+'-prompt.txt')).write_text(scene['prompt']+'\n',encoding='utf-8')
 records.append({'id':scene['id'],'file':scene['file'],'width':1122,'height':1402,'bytes':target.stat().st_size,'sha256':sha(target),'original_bytes_preserved':True})
 markdown+=['## '+scene['id']+' — '+scene['title'],'','[เปิดภาพต้นฉบับ]('+scene['file']+')','','```text',scene['prompt'],'```','']
(HERE/'PROMPTS.md').write_text('\n'.join(markdown),encoding='utf-8')
(HERE/'manifest.json').write_text(json.dumps({'images':records,'generation_requests':0,'paid_api_calls':0},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
cards=[]
for s in data['scenes']:
 cards.append('<article class="card"><a href="'+s['file']+'" target="_blank" rel="noopener"><img src="'+s['file']+'" alt="'+html.escape(s['title'])+'"></a><div class="body"><h2>'+s['id']+' · '+html.escape(s['title'])+'</h2><div class="actions"><a class="button" href="'+s['file']+'" download>ดาวน์โหลดภาพ PNG</a><button class="button" data-copy="'+s['id']+'">คัดลอก Prompt</button></div><pre id="prompt-'+s['id']+'">'+html.escape(s['prompt'])+'</pre><a href="'+s['id']+'-prompt.txt" download>เก็บ Prompt เป็นไฟล์ .txt</a></div></article>')
page='''<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ภาพ + Prompt สำหรับ Google Flow</title><style>*{box-sizing:border-box}body{margin:0;background:#f7f3e8;color:#354b32;font:16px/1.8 'Leelawadee UI',Tahoma,sans-serif}main{max-width:1450px;margin:auto;padding:30px 22px}h1{font-size:27px;margin:0}p{color:#6f7b62;margin:8px 0 20px}a{color:inherit}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.card{min-width:0;background:#fffaf0;border:1px solid #d7ddc9;border-radius:14px;overflow:hidden}.card img{display:block;width:100%;height:auto}.body{padding:17px}h2{font-size:20px;margin:0 0 12px}.actions{display:flex;gap:8px;flex-wrap:wrap}.button{display:inline-block;min-height:44px;padding:8px 12px;background:#e5ecd9;color:#354b32;border:1px solid #cdd7bd;border-radius:8px;text-decoration:none;cursor:pointer;font:inherit;font-size:14px}.button:hover{background:#d6e1c5}.button:focus-visible,a:focus-visible{outline:3px solid #82975d;outline-offset:4px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2efdf;color:#45553a;border-radius:8px;padding:14px;font:13px/1.8 Consolas,monospace}.steps{padding:17px;background:#e8ecdc;border-radius:10px;margin:20px 0 25px}.steps p{margin:0}.download{display:flex;gap:12px;flex-wrap:wrap;margin:15px 0}@media(max-width:950px){.grid{grid-template-columns:1fr}.card{max-width:660px;margin:auto}main{padding:22px 16px}h1{font-size:23px}}</style></head><body><main><h1>ภาพต้นฉบับ + Prompt สำหรับ Google Flow</h1><p>ชุด 1A / 2A / 3A · PNG 1122 × 1402 · คงไฟล์ต้นฉบับครบทุกพิกเซล</p><div class="download"><a class="button" href="google-flow-images-prompts.zip" download>ดาวน์โหลดครบชุด ZIP</a><a class="button" href="PROMPTS.md">เปิด Prompt ทั้งสาม</a></div><div class="steps"><p>ใน Flow เลือก <strong>Video → Frames → Add start frame</strong> แล้วใส่ภาพและ Prompt ที่ตรงกัน<br>ตรวจ crop ก่อนสร้างภาพเคลื่อนไหว และเก็บวิดีโอ MP4 ต้นฉบับที่ความละเอียดสูงสุดที่บัญชีมีให้</p></div><div class="grid">'''+''.join(cards)+'''</div><p><a href="README.md">ขั้นตอนเพิ่มเติม</a> · <a href="https://support.google.com/flow/answer/16353334?hl=en" target="_blank" rel="noopener">Google Flow Help</a></p></main><script>document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{const text=document.querySelector('#prompt-'+b.dataset.copy).textContent;try{await navigator.clipboard.writeText(text)}catch{const t=document.createElement('textarea');t.value=text;document.body.append(t);t.select();document.execCommand('copy');t.remove()}b.textContent='คัดลอกแล้ว';setTimeout(()=>b.textContent='คัดลอก Prompt',1800)})</script></body></html>'''
(HERE/'index.html').write_text(page,encoding='utf-8')
selected=[HERE/'README.md',HERE/'PROMPTS.md',HERE/'prompts.json',HERE/'manifest.json',HERE/'index.html']+[HERE/s['file'] for s in data['scenes']]+[HERE/(s['id']+'-prompt.txt') for s in data['scenes']]
with zipfile.ZipFile(HERE/'google-flow-images-prompts.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for file in selected:archive.write(file,file.name)
with zipfile.ZipFile(HERE/'google-flow-images-prompts.zip') as archive:
 assert archive.testzip() is None
 for record in records:assert hashlib.sha256(archive.read(record['file'])).hexdigest()==record['sha256']
print(json.dumps({'images':3,'prompts':3,'original_size':[1122,1402],'original_hashes_match':True,'zip_integrity':'pass','zip_bytes':(HERE/'google-flow-images-prompts.zip').stat().st_size}))

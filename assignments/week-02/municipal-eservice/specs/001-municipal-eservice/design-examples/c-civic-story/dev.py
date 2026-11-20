"""Local auto-reloading preview for the selected civic UI; no third-party packages."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit,unquote
import argparse,json,mimetypes,re,subprocess,sys,threading,time

HERE=Path(__file__).resolve().parent
FEATURE=HERE.parents[1]

CLIENT=r"""<script data-civic-live>
(()=>{
 const version=__VERSION__,key='civic-live-position';
 try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved){if(['citizen','staff'].includes(saved.screen))document.querySelector('[data-screen='+saved.screen+']')?.click();const actor=document.querySelector('#actor-picker');if(actor&&saved.actor){actor.value=saved.actor;actor.dispatchEvent(new Event('change',{bubbles:true}))}requestAnimationFrame(()=>scrollTo(0,saved.y||0));sessionStorage.removeItem(key)}}catch{}
 let message;
 function show(text){if(!message){message=document.createElement('aside');message.setAttribute('role','status');Object.assign(message.style,{position:'fixed',bottom:'12px',right:'12px',zIndex:'2147483647',maxWidth:'min(560px,calc(100% - 24px))',maxHeight:'230px',overflow:'auto',padding:'14px 18px',border:'1px solid #c28663',borderRadius:'10px',background:'#fff4e6',color:'#603d2c',font:'12px/1.6 Consolas,monospace',whiteSpace:'pre-wrap',boxShadow:'0 6px 25px #0002'});document.body.append(message)}message.textContent=text}
 async function poll(){try{const response=await fetch('/__live/status',{cache:'no-store'});if(!response.ok)throw new Error('Preview unavailable');const state=await response.json();if(state.error){show('Live preview: fix the source and save again.\n\n'+state.error)}else{message?.remove();message=undefined;if(state.version!==version){try{sessionStorage.setItem(key,JSON.stringify({y:scrollY,actor:document.querySelector('#actor-picker')?.value,screen:document.querySelector('[data-screen][aria-pressed=true]')?.dataset.screen}))}catch{}location.reload();return}}}catch{show('Live preview stopped. Start the Civic UI: Live Preview task again.')}setTimeout(poll,600)}
 window.__CIVIC_LIVE__={version};setTimeout(poll,400);
})();
</script>"""

class Preview:
    def __init__(self,wireframes=False):
        self.wireframes=wireframes
        self.source=FEATURE/'wireframes' if wireframes else HERE
        self.output=FEATURE/'wireframes/index.html' if wireframes else FEATURE/'design-preview.html'
        self.lock=threading.Lock()
        self.stop=threading.Event()
        self.version=0
        self.error=None
        self.building=False
        self.last_scene=None
        output=self.output
        self.page=output.read_bytes() if output.exists() else b'<html><body><h1>Waiting for a valid preview</h1></body></html>'

    def signature(self):
        paths=[HERE/'template.html',HERE/'preview.js',HERE/'build.py',FEATURE/'design-tokens.json',FEATURE/'design-assets.json']
        if self.wireframes:
            paths=[HERE/'template.html',FEATURE/'design-tokens.json',FEATURE/'design-assets.json']+[self.source/name for name in ['template.html','core.js','pages-public.js','pages-staff.js','pages-admin.js','actions.js','routes.json','seed.json','build.py']]
        motion_dir=FEATURE/'design-assets/motion'
        if motion_dir.exists():paths += sorted(p for p in motion_dir.iterdir() if p.is_file())
        try:
            asset=json.loads((FEATURE/'design-assets.json').read_text('utf-8-sig'))
            scene=(FEATURE/asset['scene']['webSource']).resolve()
            scene.relative_to(FEATURE.resolve())
            self.last_scene=scene
        except (OSError,ValueError,KeyError):
            pass
        if self.last_scene is not None:paths.append(self.last_scene)
        result=[]
        for path in paths:
            try:
                stat=path.stat();result.append((str(path),stat.st_mtime_ns,stat.st_size))
            except OSError:result.append((str(path),None,None))
        return tuple(result)

    def build(self):
        with self.lock:self.building=True
        try:
            run=subprocess.run([sys.executable,str(self.source/'build.py')],cwd=self.source,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=30)
            if run.returncode:raise RuntimeError((run.stderr or run.stdout or 'Build failed').strip())
            page=self.output.read_bytes()
            with self.lock:
                self.page=page;self.version+=1;self.error=None
            print('CIVIC_PREVIEW_UPDATED',flush=True)
        except (OSError,RuntimeError,subprocess.TimeoutExpired) as exc:
            with self.lock:self.error=str(exc)
            print('CIVIC_PREVIEW_ERROR: '+str(exc),flush=True)
        finally:
            with self.lock:self.building=False

    def watch(self,seen):
        changed=None
        while not self.stop.wait(.15):
            current=self.signature()
            if current!=seen:seen=current;changed=time.monotonic()
            elif changed is not None and time.monotonic()-changed>=.3:
                self.build();changed=None

    def state(self):
        with self.lock:return dict(version=self.version,error=self.error,building=self.building)

    def rendered(self):
        with self.lock:page=self.page.decode('utf-8-sig');version=self.version
        client=CLIENT.replace('__VERSION__',str(version))
        if '</body>' in page:page=page.replace('</body>',client+'</body>',1)
        else:page+=client
        return page.encode('utf-8')

def handler(preview):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def send_content(self,data,kind,status=200):
            self.send_response(status)
            self.send_header('Content-Type',kind)
            self.send_header('Cache-Control','no-store')
            self.send_header('Content-Length',str(len(data)))
            self.end_headers()
            try:
                if self.command!='HEAD':self.wfile.write(data)
            except (BrokenPipeError,ConnectionResetError):pass
        def send_motion(self,path):
            root=(FEATURE/'design-assets/motion').resolve()
            file=(FEATURE/path.lstrip('/')).resolve()
            try:file.relative_to(root)
            except ValueError:
                self.send_content(b'Not found','text/plain',404);return
            if not file.is_file() or file.suffix.lower() not in {'.mp4','.png','.jpg','.webp','.json','.css','.js'}:
                self.send_content(b'Not found','text/plain',404);return
            size=file.stat().st_size;start=0;end=size-1;status=200
            requested=self.headers.get('Range')
            if requested:
                match=re.fullmatch(r'bytes=(\d*)-(\d*)',requested)
                valid=bool(match and (match[1] or match[2]))
                if valid:
                    if match[1]:start=int(match[1]);end=min(int(match[2]),size-1) if match[2] else size-1
                    else:start=max(0,size-int(match[2]))
                    valid=0<=start<=end<size
                if not valid:
                    self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.send_header('Content-Length','0');self.end_headers();return
                status=206
            length=end-start+1
            self.send_response(status)
            self.send_header('Content-Type',mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
            self.send_header('Content-Length',str(length))
            self.send_header('Accept-Ranges','bytes')
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            if status==206:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
            self.end_headers()
            if self.command=='HEAD':return
            try:
                with file.open('rb') as stream:
                    stream.seek(start);remaining=length
                    while remaining:
                        chunk=stream.read(min(remaining,64*1024))
                        if not chunk:break
                        self.wfile.write(chunk);remaining-=len(chunk)
            except (BrokenPipeError,ConnectionResetError):pass
        def do_HEAD(self):self.do_GET()
        def do_GET(self):
            path=unquote(urlsplit(self.path).path)
            if path in ['/','/index.html','/design-preview.html']:
                self.send_content(preview.rendered(),'text/html; charset=utf-8')
            elif path=='/__live/status':
                self.send_content(json.dumps(preview.state()).encode(),'application/json')
            elif path.startswith('/design-assets/motion/'):
                self.send_motion(path)
            elif path=='/favicon.ico':self.send_content(b'','image/x-icon',204)
            else:self.send_content(b'Not found','text/plain',404)
    return Handler

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=4173)
    parser.add_argument('--wireframes',action='store_true',help='Preview the 15-page wireframe atlas')
    args=parser.parse_args()
    if not 0<=args.port<=65535:parser.error('Port must be between 0 and 65535')
    preview=Preview(args.wireframes)
    try:server=ThreadingHTTPServer(('127.0.0.1',args.port),handler(preview))
    except OSError as exc:parser.exit(2,f'Cannot start preview on port {args.port}: {exc}\nStop the existing preview task or choose another --port.\n')
    server.daemon_threads=True
    print('CIVIC_PREVIEW_STARTING',flush=True)
    initial=preview.signature()
    preview.build()
    watcher=threading.Thread(target=preview.watch,args=(initial,),daemon=True);watcher.start()
    print(f'CIVIC_PREVIEW_READY http://127.0.0.1:{server.server_address[1]}/',flush=True)
    print(f'Source folder: {preview.source}',flush=True)
    print(f'Design tokens: {FEATURE / "design-tokens.json"}',flush=True)
    print('Save the source files to refresh. Ctrl+C stops the preview.',flush=True)
    try:server.serve_forever(poll_interval=.2)
    except KeyboardInterrupt:pass
    finally:
        preview.stop.set();server.server_close();watcher.join(timeout=1)
    return 0

if __name__=='__main__':raise SystemExit(main())

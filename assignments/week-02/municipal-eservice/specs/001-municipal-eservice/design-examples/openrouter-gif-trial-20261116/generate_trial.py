"""One native GIF request to OpenRouter, using the approved original 1A still.

No automatic retries: a timeout can mean the paid request still ran upstream.
The API key is read only from OPENROUTER_API_KEY and never written to a file.
"""
from pathlib import Path
from datetime import datetime,timezone
import base64,hashlib,json,os,time,urllib.request,urllib.error,sys
sys.stdout.reconfigure(encoding='utf-8')
HERE=Path(__file__).resolve().parent
SOURCE=HERE.parent/'civic-motion-20261116/1A-approved.png'
ENDPOINT='https://openrouter.ai/api/v1/images'
PROMPT='''Create an actual animated GIF using the attached approved illustration as the exact visual and composition reference. This is a Thai suburban municipal office in warm, detailed watercolor and gouache on ivory paper. Keep the original architecture, cream walls, tiled roof, parked pickup and motorbikes, people, perspective, sunlight, paper texture and palette. The camera remains locked. Animate a gentle, clearly visible, natural breeze in the outer tree leaves and in the Thai flag's cloth only. Branches sway organically and the cloth ripples with coherent motion; the pole, office and people stay still. Preserve crisp architectural edges, foliage detail and recognizable people at the requested 640x800 output size. Make the complete sequence a smooth repeating loop with a matching start/end pose. No camera pan or zoom, no scene transition, no blanket distortion across the picture. Return one animated GIF, not a static image and not a visible contact sheet or storyboard grid.'''
SETTINGS={'model':'openai/gpt-image-2.6-sunburst','prompt':PROMPT,'output_format':'gif','size':'640x800','quality':'high','frame_count':16,'frame_duration_ms':80,'n':1,'provider':{'only':['openai'],'allow_fallbacks':False}}
sha=lambda b:hashlib.sha256(b).hexdigest()
def stamp():return datetime.now(timezone.utc).isoformat()
def write(name,data):
 (HERE/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def main():
 if (HERE/'request-status.json').exists():
  raise SystemExit('Existing submission record found. Inspect it before any new paid request; no automatic resubmission.')
 token=os.environ.get('OPENROUTER_API_KEY')
 if not token:raise SystemExit('OPENROUTER_API_KEY is not configured')
 source=SOURCE.read_bytes()
 write('request-public.json',{'endpoint':ENDPOINT,'parameters':SETTINGS,'reference':{'file':SOURCE.name,'sha256':sha(source),'bytes':len(source)},'documentation':'https://openrouter.ai/docs/guides/overview/multimodal/image-generation','raw_output_policy':'Save provider GIF bytes without resizing, warping, frame interpolation, or local animation generation.'})
 payload={**SETTINGS,'input_references':[{'type':'image_url','image_url':{'url':'data:image/png;base64,'+base64.b64encode(source).decode('ascii')}}]}
 request=urllib.request.Request(ENDPOINT,data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json','X-Title':'Municipal e-Service GIF trial'},method='POST')
 state={'status':'submitting','started_at':stamp(),'source_sha256':sha(source),'model':SETTINGS['model'],'requested_size':SETTINGS['size'],'requested_frames':16,'automatic_retries':0}
 write('request-status.json',state);print(json.dumps({'status':'submitting','model':SETTINGS['model'],'size':'640x800','frames':16,'requests':1}),flush=True)
 start=time.monotonic()
 try:
  with urllib.request.urlopen(request,timeout=600) as response:
   data=json.load(response);status=response.status
 except urllib.error.HTTPError as error:
  try:body=json.loads(error.read());detail=body.get('error',{});detail={'code':detail.get('code'),'message':str(detail.get('message',''))[:1000]}
  except Exception:detail={'message':'API returned an HTTP error; response body omitted'}
  state.update(status='http_error',http_status=error.code,error=detail,finished_at=stamp(),elapsed_seconds=round(time.monotonic()-start,2));write('request-status.json',state);print(json.dumps(state,ensure_ascii=False),flush=True);return 2
 except Exception as error:
  state.update(status='outcome_unknown',error_type=type(error).__name__,message='Network/response failure. The request may still have executed; do not automatically retry.',finished_at=stamp(),elapsed_seconds=round(time.monotonic()-start,2));write('request-status.json',state);print(json.dumps(state),flush=True);return 3
 metadata={k:v for k,v in data.items() if k not in ['data']}
 metadata['data']=[{k:v for k,v in item.items() if k not in ['b64_json','url']} for item in data.get('data',[])]
 write('response-metadata.json',metadata)
 images=data.get('data',[])
 if not images or not images[0].get('b64_json'):
  state.update(status='unexpected_response',finished_at=stamp(),response_keys=list(data),elapsed_seconds=round(time.monotonic()-start,2));write('request-status.json',state);print(json.dumps(state),flush=True);return 4
 raw=base64.b64decode(images[0]['b64_json']);is_gif=raw[:6] in [b'GIF87a',b'GIF89a'];filename='municipal-office-1A-openrouter.gif' if is_gif else 'unexpected-provider-output.bin'
 (HERE/filename).write_bytes(raw)
 from PIL import Image
 with Image.open(HERE/filename) as im:
  frames=im.n_frames;size=im.size;duration=0;unique=set()
  for index in range(frames):im.seek(index);im.load();duration+=im.info.get('duration',0);unique.add(sha(im.convert('RGB').tobytes()))
  check={'format':im.format,'width':size[0],'height':size[1],'frames':frames,'unique_frames':len(unique),'duration_ms':duration,'loop':im.info.get('loop'),'native_animated_gif':is_gif and frames>1 and len(unique)>1,'raw_bytes_preserved':True,'sha256':sha(raw),'bytes':len(raw)}
 write('verification.json',check)
 state.update(status='completed' if check['native_animated_gif'] else 'not_animated',http_status=status,file=filename,usage=data.get('usage'),verification=check,finished_at=stamp(),elapsed_seconds=round(time.monotonic()-start,2));write('request-status.json',state);print(json.dumps(state,ensure_ascii=False),flush=True)
 return 0 if check['native_animated_gif'] else 5
if __name__=='__main__':raise SystemExit(main())

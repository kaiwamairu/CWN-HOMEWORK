"""One authorized Grok image-to-video trial; submit once, poll separately.

Never retries a paid POST. Credentials stay in the environment. Signed result
URLs and inline source image data are not written to public metadata.
"""
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit, quote
import base64
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')
HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / 'civic-motion-20261116/1A-approved.png'
API = 'https://openrouter.ai'
MODEL = 'x-ai/grok-imagine-video-1.5-lite'
SOURCE_SHA = 'a12fd1e43768c0cdf8cac0a3ffa069d32dd9eb2c146d157c93b09a23fc0beb58'
OUTPUT = 'municipal-office-1A-grok-fixed-v2.mp4'
PROMPT = 'STATIONARY 2D CINEMAGRAPH. Use the supplied watercolor illustration as a fixed canvas, not as the opening shot of a cinematic scene. For the entire five seconds, ONLY TWO THINGS MOVE: tree leaves with their small flexible twigs, and the cloth of the Thai national flag.\n\nABSOLUTE CAMERA LOCK: The camera is bolted to a tripod and never moves. Keep EXACTLY the same framing, field of view, perspective, image scale, and crop from the first frame through the final frame. Zero zoom in, zero zoom out, zero push-in, zero dolly, zero pan, zero tilt, zero orbit, zero camera shake, zero parallax, zero automatic reframing. The roof corners, doorway, flagpole base, and parked pickup must remain at identical screen coordinates throughout. No scene transition or changing composition.\n\nALL PEOPLE ARE IMMOBILE PAINTED FIGURES: Freeze every person exactly in the reference pose and location for the entire clip. Their feet stay anchored to the same pixels. No walking, stepping, turning, gesturing, head movement, face movement, breathing, clothing motion, or entering or leaving. Never animate, replace, or redraw the people. The municipal building, doors, windows, railings, steps, vehicles, street, tree trunks, flagpole, sky, lighting, and shadows also remain completely still.\n\nALLOWED MOTION ONLY: A gentle breeze makes the leaf clusters and tiny outer twigs sway smoothly by a small, clearly visible amount. The Thai flag cloth gently ripples around its completely fixed pole, preserving the red-white-blue-white-red stripes. Confine all animation to those foliage and flag-cloth areas. Preserve the original crisp watercolor detail, paper texture, colors, architecture, and people. Let the leaves and flag complete a gentle cycle near their starting pose. The rest of the image is a still painting. Silent scene.'
SETTINGS = {'model': MODEL, 'prompt': PROMPT, 'duration': 5,
            'resolution': '720p', 'aspect_ratio': '3:4'}


def stamp():
    return datetime.now(timezone.utc).isoformat()


def write(name, data):
    (HERE / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def read(name):
    return json.loads((HERE / name).read_text(encoding='utf-8'))


def is_api(url):
    p = urlsplit(url)
    return p.scheme == 'https' and p.netloc == 'openrouter.ai' and p.path.startswith('/api/')


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is not None and not is_api(newurl):
            redirected.remove_header('Authorization')
        return redirected


OPENER = urllib.request.build_opener(SafeRedirect())


def request(url, payload=None):
    if not is_api(url):
        raise ValueError('Refusing authenticated request outside OpenRouter API')
    key = os.environ.get('OPENROUTER_API_KEY')
    if not key:
        raise SystemExit('OPENROUTER_API_KEY is not configured')
    headers = {'Authorization': 'Bearer ' + key, 'Accept': 'application/json',
               'X-Title': 'Municipal e-Service Grok fixed-frame trial v2'}
    if payload is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=json.dumps(payload).encode() if payload is not None else None,
                                 headers=headers, method='POST' if payload is not None else 'GET')
    with OPENER.open(req, timeout=120) as response:
        return json.load(response)


def clean(data):
    return {k: v for k, v in data.items() if k not in ('urls', 'unsigned_urls')}


def submit():
    if (HERE / 'request-status.json').exists():
        raise SystemExit('Submission already recorded. Use poll; never automatically resubmit.')
    if not os.environ.get('OPENROUTER_API_KEY'):
        raise SystemExit('OPENROUTER_API_KEY is not configured')
    source = SOURCE.read_bytes()
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA:
        raise SystemExit('Approved original image SHA256 does not match')
    # Read-only catalog validation before the single paid POST.
    catalog = request(API + '/api/v1/videos/models')
    model = next(x for x in catalog['data'] if x['id'] == MODEL)
    for field, value in [('supported_resolutions', '720p'), ('supported_durations', 5),
                         ('supported_aspect_ratios', '3:4'), ('supported_frame_images', 'first_frame')]:
        if value not in model.get(field, []):
            raise SystemExit('Requested value is no longer supported: ' + field)
    skus = model['pricing_skus']
    estimate = (float(skus['cents_per_image_input']) + 5 * float(skus['cents_per_video_output_second_720p'])) / 100
    if estimate > 0.16001:
        raise SystemExit('Price is above the announced $0.16 estimate; no job submitted')
    write('model-capabilities.json', model)
    (HERE / '1A-approved.png').write_bytes(source)
    write('request-public.json', {'endpoint': API + '/api/v1/videos', 'parameters': SETTINGS,
          'frame_images': [{'type': 'image_url', 'frame_type': 'first_frame',
                            'source_file': '1A-approved.png', 'sha256': SOURCE_SHA,
                            'transport': 'original PNG as inline base64 data URL'}],
          'estimated_cost_usd': estimate, 'paid_submissions_allowed': 1, 'automatic_retries': 0,
          'documentation': ['https://openrouter.ai/docs/cookbook/video-generation/image-to-video',
                            'https://github.com/OpenRouterTeam/skills/blob/main/skills/openrouter-video/SKILL.md']})
    payload = {**SETTINGS, 'frame_images': [{'type': 'image_url', 'frame_type': 'first_frame',
               'image_url': {'url': 'data:image/png;base64,' + base64.b64encode(source).decode('ascii')}}]}
    state = {'status': 'submitting', 'started_at': stamp(), 'model': MODEL,
             'source_sha256': SOURCE_SHA, 'estimated_cost_usd': estimate, 'automatic_retries': 0}
    write('request-status.json', state)
    print(json.dumps({'status': 'submitting', **SETTINGS, 'estimated_cost_usd': estimate}), flush=True)
    start = time.monotonic()
    try:
        job = request(API + '/api/v1/videos', payload)
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read()).get('error', {})
            message = str(detail.get('message', 'HTTP error'))[:1000] if isinstance(detail, dict) else str(detail)[:1000]
        except Exception:
            message = 'HTTP error; response omitted'
        state.update(status='http_error', http_status=error.code, error=message, updated_at=stamp())
        write('request-status.json', state)
        print(json.dumps(state, ensure_ascii=False), flush=True)
        return 2
    except Exception as error:
        state.update(status='outcome_unknown', error_type=type(error).__name__, updated_at=stamp(),
                     message='Submission outcome unknown; do not automatically resubmit')
        write('request-status.json', state)
        print(json.dumps(state), flush=True)
        return 3
    write('response-metadata.json', clean(job))
    state.update(clean(job), submitted_at=stamp(), submit_seconds=round(time.monotonic() - start, 2))
    write('request-status.json', state)
    print(json.dumps(state, ensure_ascii=False), flush=True)
    return 0


def poll():
    state = read('request-status.json')
    if not state.get('id'):
        raise SystemExit('No job id recorded; no new job will be submitted')
    poll_url = urljoin(API, state.get('polling_url') or '/api/v1/videos/' + quote(state['id'], safe=''))
    job = request(poll_url)
    write('response-metadata.json', clean(job))
    state.update(clean(job), updated_at=stamp())
    write('request-status.json', state)
    if job.get('status') == 'completed':
        content_url = API + '/api/v1/videos/' + quote(state['id'], safe='') + '/content?index=0'
        key = os.environ['OPENROUTER_API_KEY']
        req = urllib.request.Request(content_url, headers={'Authorization': 'Bearer ' + key})
        with OPENER.open(req, timeout=120) as response:
            raw = response.read()
            content_type = response.headers.get('Content-Type')
        if len(raw) < 1000 or b'ftyp' not in raw[:64]:
            raise SystemExit('Downloaded output is not a recognizable MP4; not saved as video')
        (HERE / OUTPUT).write_bytes(raw)
        verification = {'file': OUTPUT, 'raw_provider_bytes_preserved': True, 'bytes': len(raw),
                        'sha256': hashlib.sha256(raw).hexdigest(), 'content_type': content_type,
                        'usage': job.get('usage'), 'downloaded_at': stamp()}
        write('verification.json', verification)
        state.update(output=OUTPUT, verification=verification)
        write('request-status.json', state)
    print(json.dumps(state, ensure_ascii=False), flush=True)
    return 2 if job.get('status') in ('failed', 'cancelled', 'expired') else 0


if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else 'help'
    if action not in ('submit', 'poll'):
        raise SystemExit('Usage: python generate_trial.py submit|poll')
    raise SystemExit(submit() if action == 'submit' else poll())

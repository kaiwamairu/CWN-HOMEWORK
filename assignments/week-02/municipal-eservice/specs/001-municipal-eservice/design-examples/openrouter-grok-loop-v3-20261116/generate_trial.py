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
OUTPUT = 'municipal-office-1A-grok-loop-v3.mp4'
PROMPT = 'SEAMLESS ANIMATED-GIF-STYLE LOOP. Create a five-second, infinitely repeatable 2D cinemagraph from the supplied watercolor illustration. The entire animation is ONE COMPLETE PERIODIC CYCLE. The final image must return to the exact initial composition and poses so that repeating the clip has no visible jump, reset, cut, or change of scene. Motion direction and speed must also continue smoothly across the last-to-first boundary. This is a looping still illustration with localized motion only.\n\nONLY ANIMATE TREE FOLIAGE AND THAI FLAG CLOTH. Give the leaf clusters and small outer twigs a gentle, clearly visible periodic sway: start at the reference position, sway slightly one way, pass through the reference position, sway slightly the other way, then return exactly to the reference position at the end of five seconds. The flag cloth makes one gentle repeating ripple cycle around its completely fixed pole and returns to its initial shape and position at the end. Preserve the red-white-blue-white-red stripes. All allowed motion repeats as the same five-second cycle. No growing displacement, no escalating wind, no final flourish, no pause or fade at the loop boundary.\n\nABSOLUTE CAMERA AND FRAME LOCK. Keep the supplied image as an unmoving printed canvas. The framing, crop, field of view, perspective, image scale, roof corners, doorway, flagpole base, and parked pickup remain at identical screen coordinates in EVERY frame. Zero zoom in, zero zoom out, zero push-in, zero dolly, zero pan, zero tilt, zero orbit, zero shake, zero parallax, zero reframing. The camera is fixed for the entire clip, including the loop boundary.\n\nPEOPLE ARE STATIC PRINTED MARKS ON THE CANVAS. Freeze EVERY person exactly in the original reference pose and location throughout the entire cycle, including the man and woman on the steps and the officer at the entrance. Their feet, legs, arms, hands, heads, faces, clothes and shadows stay exactly as painted. Absolutely no walking, stepping, turning, gesturing, breathing, facial movement, entering, or leaving. Nobody changes position or pose at any time. The people are not animated characters. Keep the building, doors, windows, railings, steps, vehicles, street, tree trunks, flagpole, sky, light and shadows completely unchanged.\n\nPreserve crisp watercolor detail, paper texture, architecture, palette and all reference objects. Animate ONLY the foliage and flag cloth, never the whole image. At the end, return to the same reference state everywhere so the animation can repeat forever like a seamless GIF. Silent scene.'
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
               'X-Title': 'Municipal e-Service Grok seamless-loop trial v3'}
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

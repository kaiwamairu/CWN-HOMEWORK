# Approved motion in the C wireframes

Current approval recorded on 2026-11-18: both login videos are user-approved. Earlier preview-status notes below describe generation-time history; manifest.json and the two trial approval.json records hold the current status.

Source: [Drawdy comments](https://drawdy.io/?canvas=6ae4aaf93fb8ba886fccb04c).

| Scene | Approved clip | Placement |
| --- | --- | --- |
| 1A | Municipal office without people, trial 7 | Citizen home greeting hero and registration illustration |
| 2A | Citizen writing, corrected pickup image | Retained approved asset; removed from login |
| 3A | Officer reviewing documents, latest first video | Public document verification, /verify/:code |

`manifest.json` records exact source hashes. MP4 and PNG files were copied byte
for byte from the approved trials. The original approved clips were retained without transcoding or local
animation. The additional staff-login video is recorded below. The UI repeats the original clips with `loop`.

`civic-motion.js` mounts the active scene after route/tab changes, pauses it
outside the viewport and in hidden tabs, and starts with a still poster when
`prefers-reduced-motion` is enabled. Users can play or pause through the labelled
44px control. A failed media load keeps the poster. `civic-motion.css` also adds
the greeting reveal, calendar date frame and responsive sidebar profile menu.

Wireframe routes retain the existing 15 page patterns. The application header
is removed; account details and logout are under the bottom sidebar profile
button, including a compact accessible button on narrow screens. The profile
menu supports Escape, arrow keys, outside click and focus leaving the menu.

The live preview server serves only files inside this motion directory through
the media route and supports byte ranges for MP4 playback. The offline HTML and
the guide ZIP include relative references and local copies of these assets.

The existing canonical design tokens and user-edited greeting-fade definitions
remain the source of truth. These are UI wireframes, not an implemented backend
or completion evidence for the canonical application acceptance tests.

## Login illustration revision — 2026-11-16

The user's placement correction moves 3A to document verification. Citizen and
staff login now show purpose-made still previews instead of paperwork scenes:

| Still asset | Purpose | State |
| --- | --- | --- |
| auth-citizen-v2.png / auth-citizen-login-v1.mp4 | Citizen looks at the phone, screen turned inward | User-authorized Grok video preview |
| auth-staff-v1.png / auth-staff-login-v1.mp4 | Municipal officer signs in at an office computer | User-authorized Grok video preview |

Both were generated with built-in ChatGPT imagegen. Exact prompts are in
[login-illustrations-prompts.md](login-illustrations-prompts.md). New artwork has
not been marked user-approved. A1/A2/A3 original files and approval records are
retained. Both login scenes now produce video elements and play/pause controls after the subsequent user requests below.

## Login media follow-up

Citizen login now uses auth-citizen-v2.png: eyes directed at the phone and the screen facing the man. The previous still is retained. Staff login now plays auth-staff-login-v1.mp4, a single user-authorized Grok 1.5 Lite job via OpenRouter (5 seconds requested, 720p requested, actual charge $0.16). Exact provider bytes were copied; there is no local re-animation or transcoding. Its poster remains auth-staff-v1.png. Playback has the same pause, reduced-motion and error fallbacks as A1/A3. The generated video awaits user review.

## Citizen login video — 2026-11-17

The user requested a video from the edited male phone scene. auth-citizen-login-v1.mp4 is the original output of one Grok 1.5 Lite job via OpenRouter (5 seconds requested, 720p requested, actual charge $0.16). The selected auth-citizen-v2.png remains the poster and reduced-motion fallback. Exact prompt: auth-citizen-login-v1-prompt.txt. Camera fixed; subtle finger/hand gesture; gaze stays at the phone and its screen stays facing the man. New video awaits review; no automatic paid retries or local re-animation.

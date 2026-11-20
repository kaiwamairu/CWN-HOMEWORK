# Grok trial 7 — exact short prompt

Open `index.html` for the comparison with the edited no-people 1A image. `prompt.txt`
contains the exact prompt submitted; it matches both the source script and the
sanitized API request. No additional prompt text was added.

- Model: `x-ai/grok-imagine-video-1.5-lite` through OpenRouter `/api/v1/videos`
- Input: edited no-people 1A PNG, 1122 × 1402 px
- Requested: 720p, 5 seconds, 3:4, first-frame image-to-video
- Actual output: 848 × 1072 px, 5.041667 seconds
- Actual API cost for this trial: **$0.16**
- Paid submissions in this folder: **one**, automatic POST retries: **zero**
- Raw file: `municipal-office-1A-grok-no-people-v7.mp4`, 4,277,981 bytes
- SHA256: `8a082e9ac8bff1e6204190ea2ab31fa988e406feae6d01a96f74071f65922078`

## Inspection

First, middle and final decoded frames were inspected at [0.001, 2.5, 5.021667] seconds.
The inspected frames contain no people and camera framing appears stable. The flag and foliage move, but the entrance-door geometry also changes slightly. The ending flag shape and foliage arrangement do not exactly match the first frame, so the result is not a seamless loop. The source is the newly edited no-people PNG; the former time-stop paragraph was removed from the prompt.

The provider MP4 is preserved byte for byte. The browser repeats playback using
the video loop property. No local warping, masking, resizing, crossfading,
interpolation, reverse playback, re-encoding or GIF conversion was applied.
Still-frame captures were used only for inspection. The output hash, API cost,
source hash, exact prompt, sanitized request and browser findings are retained.
Credentials, inline source base64 and signed download URLs are not saved.

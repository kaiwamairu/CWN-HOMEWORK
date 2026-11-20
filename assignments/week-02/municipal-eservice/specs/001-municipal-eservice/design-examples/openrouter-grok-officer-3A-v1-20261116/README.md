# Grok trial 9 — exact short prompt

Open `index.html` for the comparison with the approved original officer scene 3A image. `prompt.txt`
contains the exact prompt submitted; it matches both the source script and the
sanitized API request. No additional prompt text was added.

- Model: `x-ai/grok-imagine-video-1.5-lite` through OpenRouter `/api/v1/videos`
- Input: unchanged approved original officer scene 3A PNG, 1122 × 1402 px
- Requested: 720p, 5 seconds, 3:4, first-frame image-to-video
- Actual output: 848 × 1072 px, 5.041667 seconds
- Actual API cost for this trial: **$0.16**
- Paid submissions in this folder: **one**, automatic POST retries: **zero**
- Raw file: `officer-review-3A-grok-v1.mp4`, 3,803,846 bytes
- SHA256: `ccebfb2921d8957849f29d8af0d87bccfd2f89cfa5fe19798f51e28833ae8b30`

## Inspection

First, middle and final decoded frames were inspected at [0.001, 2.5, 5.021667] seconds.
The officer's writing hand and pen move to check the desk form; a small check mark appears. The held sheet remains in the same hand and flexes slightly, while camera framing appears stable at sampled times. The officer's head also moves slightly. The final pen position and added check mark differ from the first frame, so this is not an exact seamless loop.

The provider MP4 is preserved byte for byte. The browser repeats playback using
the video loop property. No local warping, masking, resizing, crossfading,
interpolation, reverse playback, re-encoding or GIF conversion was applied.
Still-frame captures were used only for inspection. The output hash, API cost,
source hash, exact prompt, sanitized request and browser findings are retained.
Credentials, inline source base64 and signed download URLs are not saved.

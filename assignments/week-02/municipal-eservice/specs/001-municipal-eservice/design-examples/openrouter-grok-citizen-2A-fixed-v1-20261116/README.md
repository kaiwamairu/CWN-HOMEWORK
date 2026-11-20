# Grok trial 8 — exact short prompt

Open `index.html` for the comparison with the corrected-pickup citizen scene 2A image. `prompt.txt`
contains the exact prompt submitted; it matches both the source script and the
sanitized API request. No additional prompt text was added.

- Model: `x-ai/grok-imagine-video-1.5-lite` through OpenRouter `/api/v1/videos`
- Input: corrected-pickup citizen scene 2A PNG, 1122 × 1402 px
- Requested: 720p, 5 seconds, 3:4, first-frame image-to-video
- Actual output: 848 × 1072 px, 5.041667 seconds
- Actual API cost for this trial: **$0.16**
- Paid submissions in this folder: **one**, automatic POST retries: **zero**
- Raw file: `citizen-writing-2A-truck-fixed-grok-v1.mp4`, 3,170,987 bytes
- SHA256: `b16fc05c6754631b4c2291e2a2a440bbf02bd02758a5eece42086632df7d6a62`

## Inspection

First, middle and final decoded frames were inspected at [0.001, 2.5, 5.021667] seconds.
The foreground writing hand and pen move over the form, and camera framing appears stable at sampled times. The corrected pickup remains in the exterior scene. Additional motion occurs in the background: the officer moves and lifts a document, and the seated waiting person shifts. The final foreground hand position and background poses differ from the first frame, so the result is not a seamless loop.

The provider MP4 is preserved byte for byte. The browser repeats playback using
the video loop property. No local warping, masking, resizing, crossfading,
interpolation, reverse playback, re-encoding or GIF conversion was applied.
Still-frame captures were used only for inspection. The output hash, API cost,
source hash, exact prompt, sanitized request and browser findings are retained.
Credentials, inline source base64 and signed download URLs are not saved.

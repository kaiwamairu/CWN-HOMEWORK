# Grok trial 6 — exact short prompt

Open `index.html` for the comparison with the original 1A image. `prompt.txt`
contains the exact prompt submitted; it matches both the source script and the
sanitized API request. No additional prompt text was added.

- Model: `x-ai/grok-imagine-video-1.5-lite` through OpenRouter `/api/v1/videos`
- Input: unchanged approved original 1A PNG, 1122 × 1402 px
- Requested: 720p, 5 seconds, 3:4, first-frame image-to-video
- Actual output: 848 × 1072 px, 5.041667 seconds
- Actual API cost for this trial: **$0.16**
- Paid submissions in this folder: **one**, automatic POST retries: **zero**
- Raw file: `municipal-office-1A-grok-time-stop-v6.mp4`, 5,080,637 bytes
- SHA256: `414be9c8862979bcb0379d57febb2eeb9ac53173d68856e694b48290511eae2b`

## Inspection

First, middle and final decoded frames were inspected at [0.001, 2.5, 5.021667] seconds.
Camera framing appears stable at sampled times. People remain near their initial locations but still change head and leg poses, and the ending flag shape differs from the first frame. Time-stop wording did not completely freeze people or create a seamless loop.

The provider MP4 is preserved byte for byte. The browser repeats playback using
the video loop property. No local warping, masking, resizing, crossfading,
interpolation, reverse playback, re-encoding or GIF conversion was applied.
Still-frame captures were used only for inspection. The output hash, API cost,
source hash, exact prompt, sanitized request and browser findings are retained.
Credentials, inline source base64 and signed download URLs are not saved.

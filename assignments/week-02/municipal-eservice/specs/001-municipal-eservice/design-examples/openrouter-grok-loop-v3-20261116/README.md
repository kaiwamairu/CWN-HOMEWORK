# Grok trial 3 — GIF-style looping prompt

Open `index.html` to play the raw video on repeat beside the original 1A image.
The full submitted prompt is in `prompt.txt` and the expandable page section.

- Model: `x-ai/grok-imagine-video-1.5-lite` through OpenRouter `/api/v1/videos`
- Source: unchanged approved original 1A PNG, 1122 × 1402 px
- Requested: 720p, 5 seconds, 3:4, first-frame image-to-video
- Actual output: **848 × 1072 px, 5.041667 seconds**
- Actual API cost for this trial: **$0.16**
- New paid submissions: **one**, automatic POST retries: **zero**
- Raw file: `municipal-office-1A-grok-loop-v3.mp4`, 5,577,388 bytes
- SHA256: `1c926452aadac7e0cd03f43f5cb40670d6f91a19b835adf310292185eecca5b3`

## New prompt emphasis

The prompt opens and closes with a seamless animated-GIF-style loop requirement.
It defines one complete five-second periodic cycle, matching initial/final poses
and continuing direction and speed across the boundary. Leaf clusters sway one
way, through the starting pose, the other way, and back. The flag is asked to
return to its initial cloth shape. The prompt retains the fixed camera, no zoom,
motionless people, and motion limited to foliage and flag cloth requirements.

## Observed output

The first frame (0.001 s), middle (2.5 s) and final frame (5.021667 s) were decoded
and inspected. Camera framing and building geometry appear stable. The foliage
returns near its starting arrangement by the final frame, but people still move
toward the entrance and do not return to their original positions. The flag also
differs between the first and last frames. **The result is not a seamless loop**
and does not satisfy the request to keep every person stationary.

The comparison page uses the browser's video `loop` property. Repeated playback
is distinct from matching generated first/last frames. The artifact remains the
provider's original MP4 rather than a converted GIF. No local warping, resizing,
crossfade, interpolation, masking, reverse playback, or re-encoding was applied.
Only diagnostic still-frame captures were used for inspection. No further paid
generation was submitted after this result.

The output hash, API cost, source hash, request settings and browser observations
are retained. Credentials, inline base64 source data and signed result URLs are
omitted from saved metadata.

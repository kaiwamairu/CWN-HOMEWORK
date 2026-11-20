# Grok trial 2 — stronger fixed-frame prompt

Open `index.html` for the comparison with the approved original 1A image.

This is the second, separately authorized trial. It uses the same original PNG,
not the previous video, with a rewritten prompt in `prompt.txt`.

- Model: `x-ai/grok-imagine-video-1.5-lite` through OpenRouter `/api/v1/videos`
- Requested: 720p, 5 seconds, 3:4, first-frame image-to-video
- Returned: **848 × 1072 px, 5.041667 seconds**
- Actual cost for this new trial: **$0.16**
- Paid submissions in this folder: **one**, automatic POST retries: **zero**
- Raw MP4: `municipal-office-1A-grok-fixed-v2.mp4`, 5,080,655 bytes
- SHA256: `c9d94d20c92bb18171e8474d83f3beb51810bc7bf635d4aca70a3055a7dde196`

## Prompt changes

The prompt defines a stationary 2D cinemagraph, locks camera framing, field of
view, perspective, image scale and crop, forbids all zoom and camera movement,
anchors architecture and vehicles, and explicitly freezes every person's feet,
pose, head, face and clothing. It allows motion only in leaf clusters, small
outer twigs, and the Thai flag cloth around its fixed pole.

## Actual result

Decoded frames were inspected at 0.05, 2.5 and 4.8 seconds. Building geometry and
framing appear stable at those times, without obvious zoom. The leaves and flag
move, but the man and woman **still walk up the steps toward the entrance**.
The model did not follow the person-freezing instructions. This trial therefore
does **not** meet the requirement that only foliage and the flag move.

The original API output is preserved. No local animation, warping, resizing,
stabilization, masking, interpolation or re-encoding was applied. No additional
generation was submitted after seeing this result.

The comparison page includes a link to trial 1. The full prompt, sanitized
request settings, output hash, browser observations and API cost are retained.
API credentials, inline source base64 and signed output URLs are not saved.

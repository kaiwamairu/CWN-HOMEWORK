# Grok image-to-video trial — approved image 1A

Open `index.html` in a browser to compare the original PNG and generated MP4.
The download button saves the raw provider output.

- Provider API: OpenRouter `POST /api/v1/videos`
- Model: `x-ai/grok-imagine-video-1.5-lite`
- Input: approved municipal office illustration `1A-approved.png`, unchanged, 1122 × 1402 px
- Requested: 720p, 5 seconds, 3:4, first-frame image-to-video
- Actual browser metadata: **848 × 1072 px, 5.041667 seconds**
- Actual API usage: **$0.16**, not BYOK
- Paid submissions: **one**, automatic POST retries: **zero**
- Output: `municipal-office-1A-grok.mp4`, 6,001,899 bytes
- Output SHA256: `5da9b2ccf6124bbb1c5329e9ef97ab830876da9d1b8d7f8643490332d4f7e5a4`

The MP4 was saved directly from the API. No local resizing, warping, frame
interpolation, conversion to GIF, or post-processing was applied. The requested
aspect ratio and the returned pixel dimensions differ; the player preserves the
actual output rather than cropping it to the request.

## Inspection

The browser decoded and played the video, with `readyState = 4` and no video
error. The original image loaded at its full width. The comparison page had no
horizontal overflow at a 1440 px viewport. Seeking to 2.5 and 4.8 seconds worked.
A decoded frame at approximately 4.82 seconds retained the watercolor office
scene and showed the people in new poses. The model did **not** obey the request
to keep people still. This is a generated motion trial, not an approved seamless
website loop; the end-to-start transition can be visible.

`verification.json` records the raw output hash and API cost.
`browser-verification.json` records the observed browser metadata.
`request-public.json` contains the settings and image hash without the API key
or inline base64 image data. Signed download URLs are omitted from metadata.

The source script accepts `submit` and `poll`. **Do not submit another job to
repeat this trial.** A recorded submission blocks automatic resubmission;
`poll` only checks the existing job and downloads its output.

References:

- [OpenRouter model](https://openrouter.ai/x-ai/grok-imagine-video-1.5-lite)
- [Image-to-video API guide](https://openrouter.ai/docs/cookbook/video-generation/image-to-video)
- [Official OpenRouter video skill: data URL input](https://github.com/OpenRouterTeam/skills/blob/main/skills/openrouter-video/SKILL.md)

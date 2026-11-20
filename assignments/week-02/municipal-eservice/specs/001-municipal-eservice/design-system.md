# Design system — C / เมืองแห่งบริการ

## Decision and scope

**Selected by the user on 2026-11-16: C — เมืองแห่งบริการ / Illustrated Civic Service.**
User decision: “เอาแบบ C ครับ”. This supersedes the earlier B material choice.
The key quality is relevant visual storytelling on the UI: municipal buildings, service counters,
documents, shops and houses with blueprints. Warm translucent cream cards, forest-green navigation
and static light/shadows support that direction. All 15 page patterns use this system.

## Authoritative files

- [design-tokens.json](design-tokens.json): editable values and selectedVariant C; local schemaVersion 1.
- [design-tokens.css](design-tokens.css): generated variables with `--ds-` prefix.
- [design-assets.json](design-assets.json): scene, sprite IDs, semantic mapping and accessibility rules.
- [design-preview.html](design-preview.html): selected two-screen offline preview.
- [ui-layouts.md](contracts/ui-layouts.md): 15 main page patterns plus the root redirect.
- [Selected concept sources](design-examples/c-civic-story/DESIGN.md): illustration provenance and panorama prompt.

T001 imports tokens in the app root and copies the selected SVG artwork, approved MP4 clips and posters to `web/public/illustrations/`, preserving the motion manifest and byte hashes.
T017 builds reusable `CivicIllustration` and video-scene components, the header-free role shell and profile menu. T071 checks the selected
visual behavior. Earlier studies are [archived](design-examples/b-static-glass/README.md).
This choice updates the implementation contract; all 78 application tasks remain pending.

## Color and material

| Role | Value | Use |
| --- | --- | --- |
| Forest | `#354b32` | Sidebar and municipal identity |
| Moss | `#74815c` | Supporting objects and quiet accents |
| Warm cream | `#f7f1e3` | Translucent card family |
| Canvas | `#e1e4d0` | Soft Thai suburban civic surroundings |
| Main text | `#35402b` | Headings, body, values |
| Secondary text | `#73765e` | Metadata; validate on its actual background |
| Primary action | `#52683f` on `#fff9e8` | Strong action and focus-related color family |
| Honey / terracotta | `#c59a54` / `#b87d59` | Illustration materials and restrained accents |

Cards use a 93–96% alpha cream gradient, 12px blur, 18px radius (15px compact), pale edge and
fixed soft shadow. Dense text/editing areas can use the solid data surface. Unsupported blur uses
`#f8f2e5`. In forced-colors mode use system surfaces, borders and focus outlines.
Contrast is evaluated against the actual composite. Raise local opacity or darken text as needed;
the nominal token value alone does not establish accessibility. Status meaning always includes text.

## Illustration language and meaning

| Object | UI meaning |
| --- | --- |
| Municipal building | The civic-service destination; welcome and shared identity |
| Counter with staff and citizen | Help, receipt of documents and review |
| Certificate with generic seal | SV-01 and certified output |
| Shop with permit | SV-02 business permit |
| House with blueprint | SV-03 construction permit |
| Folder | Drafts, attachments, submission and case history |
| Stamp | Approval, review and issuance |
| Papers and coins | Fees and payment |

Use the same original scene and SVG symbol set across roles. The selected panorama depicts a Thai
suburban municipal office with paved forecourt, local road, parking and nearby homes/shops. Trees are
supporting elements; avoid a forest/garden-resort setting, river or ornamental bridge.
The panorama continues with painted neighborhood detail to the left edge. Keep the bitmap full-bleed
and unfaded. Use `hero-text-fade` and `hero-text-mask` on a pointer-transparent pseudo-element of the
greeting copy only; the image outside that area remains visible. Use the same treatment at compact
widths with a smaller local footprint.
Panorama is a large welcome motif;
service objects are about 80–112px; context objects 32–48px; functional navigation icons 16–20px.
Dense queue/audit/admin screens use compact illustrations near section headings and keep data dominant.
Forms use the relevant service object at the header or stepper. Workflow imagery follows
folder → service counter → certificate, with payment/stamp objects where that step is shown.
Every image must explain the service, destination, content or next step. Preserve source Thai labels.

Decorative backgrounds/repeated objects are `aria-hidden`. Interactive service cards expose their
Thai labels. Meaningful standalone images have concise Thai alternatives. Never put required text,
status, deadline, price or personal information only in art. No fake official crest or unrelated mascot.

## Typography, spacing and layout

Production body: Noto Sans Thai with Leelawadee UI/Tahoma fallback, 16px / 1.7; labels 14px;
page titles 28px; controls at least 44px. Offline fallback must remain readable.
Spacing: 4, 8, 12, 16, 24, 32, 48px. The composition preview uses a compact scale; production
typography and target sizes are governed by these tokens and source NFR checks.

Wide role shell: 190px sidebar, compact 164px at 851–1150px, with no application header row.
Account details and logout live in the bottom sidebar profile menu; the wide menu opens upward.
Home/welcome pages use an approximately 220px illustrated hero and a three-column card grid.
The greeting uses the user-edited local fade; retain the existing translateY(12px) value and masks.
The hero date is a calendar-shaped frame. Below 851px use the compact brand/navigation bar and
a top-right profile menu that opens downward. Below 521px cards stack. Tables scroll only within
labelled regions. Operational detail pages use the page heading and a compact relevant object,
keeping the work area dominant. Entry pages place the illustrated introduction above the form
on narrow screens; the approved login panels keep enough height for both face and device.
See the four families and page-to-art matrix in [ui-layouts.md](contracts/ui-layouts.md).

## States and interaction

Visible hover/focus/active/disabled/error states remain required. Hover may change color/border;
shadow depth, illustration position and background lighting stay fixed relative to pointer movement.
No pointer-following glow, light, shadows, tilt or parallax. User-approved fixed-camera MP4 loops
are allowed only at the placements below. Color/border state transitions use 120ms ease-out;
this token is not the duration of a video loop. The greeting copy reveals through opacity for
600ms (five state intervals); reduced motion removes that reveal and smooth scrolling.
Video has a labelled 44px pause/play control, muted inline looping, viewport/hidden-tab pausing,
a selected poster for reduced motion with no initial video download, explicit opt-in playback,
and a static poster/error fallback. No new video generation is implied by rebuilding the site.
Keep keyboard order and focus clear; profile menus support Escape, arrow keys and focus return.
Loading, empty, error and not-found views use a relevant small object plus the exact functional text.

## Implementation and verification

T001 keeps JSON/CSS parity and installs assets. T017 wires the shared shell and reusable SVG/scene
component. Existing page tasks apply the page matrix. T071 verifies relevant artwork, labelled
controls, readable states, pointer invariance, reduced motion, solid fallback and 375/768/1280px.
Artwork never grants access or changes source routes, selectors, errors or business rules.
The canonical 51 acceptance IDs and 12 mutation modes are unchanged.

[design-verification.json](design-verification.json) records preview/document evidence only;
it is not proof of application implementation, a full WCAG audit or production acceptance.

## Wireframe ทุกหน้า — C

เปิด [Wireframe แบบคลิกได้ 15 หน้า](wireframes/index.html) และ [คู่มือ Wireframe](wireframes/README.md) ใช้ token, artwork และ CSS fade ปัจจุบันจากแบบ C โดยตรง มี 4 layout families: Entry, Citizen, Backoffice และ Dashboard พร้อม component loading/empty/error/403/404

นี่เป็นการตรวจหน้าตาและ user flow เท่านั้น การเชื่อม API, authentication, payment และเอกสารลงลายเซ็นเป็นงาน implementation ตาม tasks.md

## Approved scene placement — recorded 2026-11-18

The user confirmed the latest clips in chat. [Motion manifest](design-assets/motion/manifest.json)
and [approved asset index](design-examples/approved-civic-motion-20261116/index.html) identify exact bytes.

| Page | Selected scene | Meaning |
| --- | --- | --- |
| Citizen login tab | LOGIN-CITIZEN, auth-citizen-login-v1.mp4; auth-citizen-v2.png poster | Citizen looks at a phone with screen facing inward |
| Staff login tab | LOGIN-STAFF, auth-staff-login-v1.mp4; auth-staff-v1.png poster | Female municipal officer signs in at a computer |
| Registration and citizen home | 1A, 1A-municipal-office.mp4 | Thai suburban municipal office without people |
| Public verification | 3A, 3A-officer-review.mp4 | Female officer reviewing documents |
| Retained approved archive | 2A | Citizen writing; not used on either login tab |

Existing SVG service/certificate icons remain functional context. Approved scenes do not replace
labels, form controls, permissions or validation. Preserve original media quality; do not recreate,
transcode or replace accepted clips as part of app setup.

[To-do list](TODO.md) and [wireframe flow review](wireframes/review-20261118.md) track the handoff.

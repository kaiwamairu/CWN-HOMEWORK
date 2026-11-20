# C — เมืองแห่งบริการ / Illustrated Civic Interface

**Status:** Selected by the user on 2026-11-16: “เอาแบบ C ครับ”.
The canonical [design system](../../design-system.md), [tokens](../../design-tokens.json) and plan now use C.
Open [index.html](index.html) offline; switch citizen/staff to compare the same illustration language.

## 1. Visual Theme & Atmosphere

The reference's main quality is storytelling through related objects on the UI. The user clarified
that civic buildings, government offices and service-related imagery should be emphasized.
Use an original illustrated municipal service house, counter, papers and service objects to make
the process understandable. The supplied reference is visual evidence, not a source of app data.

## 2. Color

Forest `#354b32`, moss `#74815c`, warm cream `#f7f1e3`, honey `#c59a54`, terracotta `#b87d59`.
Warm translucent cards and fixed shadows retain the previously requested static material behavior.
This palette and the civic illustration language are now the selected implementation direction.

## 3. Typography

Thai body and interface use Leelawadee UI/Tahoma offline fallbacks. The prototype uses a compact
scale for composition. Production tokens still call for 16px body, 14px labels and 44px controls.
Every illustration has accompanying Thai copy; artwork never substitutes for a control's name.

## 4. Spacing & Grid

Desktop: 190px sidebar and a three-column dashboard with 12–15px gutters; services span two columns.
Below 850px navigation becomes a horizontal compact row. At 520px and below cards stack and service
illustrations sit beside the label. Staff tables scroll only inside their labelled region.

## 5. Layout & Composition

The shared hero establishes the municipality as the service destination. The overview includes
relevant cases and deadlines. Illustrations lead into actions, the service catalog, workflow and
case history. Citizen and staff examples use the same vocabulary, with their own content and permissions.

## 6. Components

| Illustration | UI location | Meaning |
| --- | --- | --- |
| Municipal building | Identity, panorama and service story card | The office responsible for services |
| Service counter with people | Help panel and journey | Staff receive and review the citizen's documents |
| Certificate with seal | SV-01 and case rows | Request and receive a certified document |
| Shop with permit | SV-02 | Business permit request |
| House and blueprint | SV-03 | Construction permit request |
| Document folder | Overview and process | Gather, submit and track documents |
| Stamp | Staff follow-up and issuance vocabulary | Review/official output |
| Papers with coins | Reusable fee illustration | Pay the service fee |

The panorama and vector illustrations are original assets. No characters or brand marks from the
reference are reused. Reusable SVG symbols are in [illustrations.svg](illustrations.svg).
The local [design-tokens.json](design-tokens.json) mirrors the canonical selected tokens; edit the canonical file first.
[design-assets.json](../../design-assets.json) defines the semantic illustration mapping.

## 7. Motion & Interaction

No pointer-following lighting, shadows, tilt, parallax or animated scenery. Only short color/border
state transitions, visible keyboard focus and normal scrolling. Reduced motion disables transitions
and smooth scrolling. Service cards, calendar, dialogs, search and queue filters work as prototypes.

## 8. Voice & Brand

Use friendly Thai civic-service language. “บ้านบริการ” is an exploratory UI title; the municipality
remains เทศบาลนครตัวอย่าง. All data is sample seed content at 1 Dec 2026 09:00. Exact functional labels,
routes, status names and policies remain governed by the original source contract when implemented.

## 9. Anti-patterns

Avoid decorative objects unrelated to civic work, using animals as service icons, placing text in
the generated panorama, fake official seals, artwork that obscures deadlines, color-only states,
cursor tracking, and treating this example as completed municipal application functionality.

## Asset provenance and generation prompt

Current scene revision 3 extends the illustrated Thai suburban neighborhood to the left edge.
The municipal office and civic setting remain on the right. The artwork is full-bleed; the greeting
uses a localized static CSS cream gradient and vertical mask, preserving detail outside the text area.

The revised panorama was created with built-in `image_gen`, editing revision 2 for composition.
Current original: [civic-thai-suburban-wide-original.png](assets/civic-thai-suburban-wide-original.png).
Web asset: [civic-thai-suburban-wide.jpg](assets/civic-thai-suburban-wide.jpg).
Exact final prompt: [civic-thai-suburban-wide-generation.md](assets/civic-thai-suburban-wide-generation.md).
The earlier suburban and garden assets remain as source history. Service SVG objects are unchanged.

## Rebuild and scope

`template.html` and `preview.js` are authoring sources. Run `python build.py` in this folder to rebuild.
The preview is self-contained and offline.
Its click-through dialogs illustrate subsequent screens; they do not submit real requests or
establish runtime acceptance of the 78 pending implementation tasks or canonical 51 acceptance IDs.
Read [verification.json](verification.json) for checks of this example only.

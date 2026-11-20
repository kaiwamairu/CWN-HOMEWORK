# e-Service Project Atlas

2026-11-16. Request: present the existing Spec Kit work as a Thai web guide and add user flows.

The page is a documentation artifact, not the municipal application. It uses self-contained
HTML/CSS/JS and SVG, works from file://, and requires no accounts, backend or external fonts.
A quiet editorial layout uses warm paper, deep green, a restrained lime accent, Thai type,
left navigation and clear section dividers. The full library includes all drafted documents
and all ten source documents. A smaller inline-chat edition retains the complete drafted
documents and all flows within Orca's 512KB limit.

Sections: overview; interactive role/process flows; three-service routing and fee examples;
boundary rules; planned task filters; full document library with search and print/download.
Flows cover citizen, identity/registration, officer review, head decisions, executive,
auditor, admin, public document verification, SLA notifications and acceptance testing.
Each step exposes actor, route, state/rules and source test references. SVG download and
an ordered text alternative keep diagrams useful for sharing and keyboard navigation.

Files: template.html (presentation/interactions), build.py (document renderer and assembler),
flows.json (editable diagram data), index.html (generated full guide), preview.html (compact
edition), userflows.md (editable flow inventory), source-documents/ (standalone source pages),
flows/ (exported SVGs), guide.zip (portable reading bundle).

Build and verify: python guide/build.py; parse/check generated HTML, compare source hashes,
validate all document IDs/links and diagram edges, then inspect in Orca browser at desktop
and mobile widths. Exercise flow selection, step detail, filters, fee examples, document
navigation/search/download and print mode. No change to business-app implementation tasks.

The library and selected preview now document C / Illustrated Civic Service, selected by the user.
The guide keeps its documentation layout; the application design contract and artwork are in the design documents and bundled preview/assets.

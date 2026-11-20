# UI layouts — selected C / เมืองแห่งบริการ

15 main page patterns, plus the root redirect. This is a visual layout contract layered over
[interface-map.md](interface-map.md) and the original CONTRACT; route and permission behavior stays authoritative there.
All families use the [selected C design system](../design-system.md), relevant civic artwork and fixed lighting.

## Four reusable families

| Family | Wide composition | Compact composition |
| --- | --- | --- |
| Entry | Role-appropriate approved scene with focused form or verification result | Single column; illustrated introduction then form/result; copy and controls stay clear of the face/device |
| Citizen | 190px forest-green sidebar; profile menu at its bottom; no app-header; illustrated welcome/calendar; three-column cream-card home; 8/4 form/detail split | Compact brand/navigation bar, profile menu at top right; stacked cards; primary action near form end |
| Backoffice | 190px sidebar (164px compact), no app-header; bottom profile/account/logout menu; filters/table; compact civic objects; split detail/timeline | Compact navigation/profile menu; stacked detail; tables scroll inside a labelled region |
| Dashboard | Shared C role shell, five KPI values and workload; restrained municipal/report objects | Stack KPI groups and reports; filters/export remain reachable; artwork never obscures values |

## Main page matrix

| # | Route | Family | Content and primary action | Related illustration |
| --- | --- | --- | --- | --- |
| 1 | `/login` | Entry | Citizen ThaiD mock and staff SSO mock tabs; exact form labels retained | LOGIN-CITIZEN inward-facing phone video / LOGIN-STAFF computer sign-in video |
| 2 | `/register` | Entry | First-time citizen profile form, validation and submission | Approved 1A municipal-office video |
| 3 | `/verify/:code` | Entry | Public verification result, document facts and exact missing/expired/signature states | Approved 3A female document-review video; certificate icon remains by result |
| 4 | `/citizen` | Citizen | Three service entry cards, drafts, cases and correction alert | Approved 1A office video, calendar date frame and all three service objects |
| 5 | `/citizen/new/:service` | Citizen | Shared three-stage wizard: details → files → payment; resume via draft query | Certificate / shop / house with blueprint; folder and coins at file/payment steps |
| 6 | `/citizen/cases/:caseNo` | Citizen | Status, due time, timeline, authorized documents and correction action | Relevant service object; folder → counter → certificate timeline |
| 7 | `/officer/queue` | Backoffice | Department queue, mine/unclaimed filters, search, SLA and permitted claim action | Compact document folder / service counter |
| 8 | `/officer/cases/:caseNo` | Backoffice | Case facts and files; work actions; timeline/audit context; explicit unmask reason | Relevant service object; counter / stamp / certificate at corresponding actions |
| 9 | `/head/approvals` | Backoffice | Approval queue and decision controls under the source policy | Stamp and certificate |
| 10 | `/dashboard` | Dashboard | Five required KPI values, period/department controls, workload and export | Small municipal-office/report context |
| 11 | `/audit` | Backoffice | Filtered read-only event table, detail and export | Document folder; restrained audit context |
| 12 | `/admin/services` | Backoffice | Fee/SLA configuration with validation and save feedback | Service objects and fee coins |
| 13 | `/admin/holidays` | Backoffice | Holiday list/calendar editing with validation | Municipal-office context; functional calendar controls |
| 14 | `/admin/users` | Backoffice | User/role/department table with allowed edit controls | Service-counter people; functional role labels |
| 15 | `/notifications` | Backoffice | Staff/head notification inbox and source read/navigation behavior | Document folder / corresponding case object |

`/` renders no extra main page: redirect to login or the authenticated role's landing page.
The wizard is one page pattern shared by SV-01/SV-02/SV-03, rather than three new page patterns.

## Information and workflow guardrails

Citizen detail exposes only owned resources. Staff case JSON remains masked until a permitted,
reasoned, audited reveal. Read-only roles do not receive edit/claim actions merely because they
share a shell. Permission, already-claimed and workload guards keep their specified order.
The correction deadline, payment/fee lock, due-time lock, issuer and signer provenance follow
the source contract. Show text states and errors exactly; styling never changes those outcomes.

Existing user flows remain in [the web guide](../../../guide/index.html) and
[userflows.md](../../../guide/userflows.md). The preview illustrates citizen home and staff queue;
it does not claim that all 15 application screens have been implemented.

## Wireframe atlas ครบ 15 page patterns

[เปิดทุกหน้าแบบคลิกได้](../wireframes/index.html) · [รายการหน้าและเส้นทาง](../wireframes/routes.json) · [ขอบเขตและวิธีเปิด](../wireframes/README.md)

เลือกหน้า บทบาท และ component state จากแถบบน หรือเดินตามเส้นทางตัวอย่าง Citizen / Staff / Report / Admin แต่ละหน้าคง token แบบ C ภาพเทศบาลชานเมืองไทย และไอคอนตามเรื่องของบริการ ชุด design-preview.html เดิมยังเป็น material study 2 หน้าจอแยกจาก atlas นี้

## Shared approved behavior

No application header row is rendered in authenticated layouts. The sidebar profile menu owns
account details and logout. Wide menus open upward; compact menus remain within the viewport.
Decorative motion is limited to the [approved placements](../design-assets/motion/manifest.json).
Keep the user's greeting fade, fixed shadows and camera framing. Pause/play, reduced-motion
posters, offscreen/hidden-tab pausing and media-error fallback are required.

The 2026-11-18 [review](../wireframes/review-20261118.md) covers prototype navigation,
validation, role examples, all 15 pages and their responsive/component states. It does not prove
server authorization or canonical application acceptance.

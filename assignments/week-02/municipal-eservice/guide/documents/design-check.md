# Design Review: municipal e-Service

**Date**: 2026-11-16. **Scope**: Documents only; runtime acceptance not performed.

## Review outcomes

- Source-rule review found all29 FR,29 BR,11 NFR and14 stories represented, with78 future tasks.
- Contract review compared inventory with original16 route rows,46 API/test-hook entries,
  33 error rows,155 selector rows,51 TC definitions and12 mutation sets.
- No critical/high source disagreement remained after the refinements below.
- No `.specify/extensions.yml` exists; there are no registered before/after workflow hooks.
- Spec Kit setup-plan/setup-tasks/check-prerequisites scripts resolve this feature successfully.

## Refinements applied during drafting

| Finding | Resolution |
| --- | --- |
| Signing-field provenance incorrectly attributed to A-63 | Corrected to CONTRACT §3/A-22; retained A-63 for PDF/inspection checks |
| No-surname public mask needed an explicit fallback | Added givenName + " ***" (A-58) and supplemental unit validation |
| Verification code allowed arbitrary eight characters in summary | Made `[A-Z0-9]{8}` explicit |
| Broad wording about JSON could forbid authorized owner/unmask responses | Clarified stored JSON columns and exact permitted response exceptions |
| Third-return button absence could conflict with B12 | Baseline absent; B12 deliberately present and third return succeeds |
| Some classroom variants have no seeded canonical TC | Added half-up tie/no-surname unit checks without changing the original51 IDs |
| NFR-04 is inspection, not browser evidence | Standalone inspector plus one named runner wrapper; report50browser/API+1inspection |
| Shared database made ordinary test parallelism unsafe | workers1, no retries, fresh actor sessions after every reset; concurrency only inside race TCs |

## Acceptance of this document package

Document checks must confirm source hashes, local links, task format/sequencing, every requirement
mapping, all canonical TC/mutation IDs and original setup-file preservation. Results are recorded
in [validation-report.json](../validation-report.json). A document-level pass is not a runtime pass.
Production Q-01–Q-36 remain unresolved agency questions with classroom defaults preserved.

## Visual direction selected after the comparison

The user selected C / เมืองแห่งบริการ on 2026-11-16, superseding B. Relevant civic buildings,
service counters and service-specific objects are the main visual language; lighting/shadows stay fixed.
[Design system](design-system.md), [tokens](design-tokens.json),
[CSS](../design-tokens.css), [layout matrix](ui-layouts.md) and
[two-screen preview](../design-preview.html) record this choice. [Asset mapping](../design-assets.json)
connects each illustration to its service/page. Cursor tracking is disabled. Earlier B is archived.
Preview checks are documented in [design-verification.json](../design-verification.json);
they do not establish application runtime acceptance or completion of T001/T017/T071.

## Visual handoff — 2026-11-18

ผู้ใช้ยืนยันคลิปชุดล่าสุดแล้ว บันทึกการอนุมัติพร้อม SHA256 ใน motion manifest และ approval.json ของคลิปเข้าสู่ระบบทั้งสอง ปรับกติกาวิดีโอแบบกล้องนิ่ง ตำแหน่งภาพ เมนูโปรไฟล์ กรอบปฏิทิน และการเอา app-header ออกแล้ว

รายละเอียดการทบทวนและขอบเขตหลักฐานอยู่ใน [wireframe review](wireframe-review.md) รายการงานติดตามใน [TODO](todo.md) งาน application acceptance และ 78 tasks ยังไม่ถูกปิดจากหลักฐาน prototype

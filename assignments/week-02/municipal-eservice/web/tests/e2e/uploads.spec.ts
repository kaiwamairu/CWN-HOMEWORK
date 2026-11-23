import {
  test, expect, MSG, attach, createDraft, expectError, expectJson, rowBy, setFiles, testFile, tid, uploadFile,
  type Actor, type Json, type TestFileName,
} from './source-helpers.js';
import type { Page } from '@playwright/test';
import type { TestFile } from '../fixtures/files.js';

const UPLOAD_TIMEOUT = { timeout: 30_000 };

async function draftJson(actor: Actor, draftId: string): Promise<Json> {
  return expectJson(await actor.get(`/api/drafts/${draftId}`), 200);
}

/** TEST-PLAN UPLOAD-01 "ก่อน": SV-01 (qty 1) draft at the upload step, opened via `?draft=` (CONTRACT §1). */
async function openUploadStep(actor: Actor, draftId: string): Promise<Page> {
  const { page, status } = await actor.open(`/citizen/new/SV-01?draft=${draftId}`);
  expect(status).toBe(200);
  await expect(tid(page, 'qty-input')).toHaveValue('1');
  await tid(page, 'to-upload-btn').click();
  await expect(tid(page, 'wizard-step')).toHaveText('2/3 แนบเอกสาร');
  return page;
}

async function removeFile(page: Page, name: string): Promise<void> {
  await tid(rowBy(page, 'file-item', 'data-name', name), 'file-remove-btn').click();
  await expect(rowBy(page, 'file-item', 'data-name', name)).toHaveCount(0);
}

test('TC-UPLOAD-01 ขนาดและจำนวนไฟล์', async ({ cast }) => {
  test.setTimeout(240_000);
  const somchai = await cast.as('somchai');
  const { draftId: uiDraft } = await createDraft(somchai, { serviceId: 'SV-01', qty: 1 });
  const page = await openUploadStep(somchai, uiDraft);
  await expect(tid(page, 'file-item')).toHaveCount(0);

  await test.step('fixture sizes are exact bytes (TEST-DATA §11)', async () => {
    expect(testFile('size-5242879.pdf').buffer.length).toBe(5_242_879);
    expect(testFile('size-5242880.pdf').buffer.length).toBe(5_242_880);
    expect(testFile('size-5242881.pdf').buffer.length).toBe(5_242_881);
  });

  for (const name of ['size-5242879.pdf', 'size-5242880.pdf'] as const) {
    await test.step(`${name}: accepted · file-item 1 · no upload-error · API 201`, async () => {
      await setFiles(page, 'upload-input-id-card', [name]);
      await expect(tid(page, 'file-item')).toHaveCount(1, UPLOAD_TIMEOUT);
      await expect(rowBy(page, 'file-item', 'data-name', name)).toHaveAttribute('data-doc-key', 'id-card');
      await expect(tid(page, 'upload-error')).toBeHidden();
      await removeFile(page, name);
      await expect(tid(page, 'file-item')).toHaveCount(0);

      const { draftId } = await createDraft(somchai, { serviceId: 'SV-01', qty: 1 });
      const body = await attach(somchai, draftId, 'id-card', name);
      expect(body.size).toBe(testFile(name).buffer.length);
    });
  }

  await test.step('size-5242881.pdf: rejected · upload-error · file-item 0 · API 400 FILE_TOO_LARGE (not 413)', async () => {
    const before = await draftJson(somchai, uiDraft);
    await setFiles(page, 'upload-input-id-card', ['size-5242881.pdf']);
    await expect(tid(page, 'upload-error')).toHaveText(MSG.FILE_TOO_LARGE, UPLOAD_TIMEOUT);
    await expect(tid(page, 'file-item')).toHaveCount(0);
    expect(await draftJson(somchai, uiDraft)).toEqual(before);

    const { draftId } = await createDraft(somchai, { serviceId: 'SV-01', qty: 1 });
    const apiBefore = await draftJson(somchai, draftId);
    await expectError(await uploadFile(somchai, draftId, 'id-card', 'size-5242881.pdf'), 400, 'FILE_TOO_LARGE');
    expect(await draftJson(somchai, draftId)).toEqual(apiBefore);
  });

  const multi = ['multi-1.pdf', 'multi-2.pdf', 'multi-3.pdf', 'multi-4.pdf'] as const;

  await test.step('count: id-card.pdf + multi-1..4 = 5 files accepted', async () => {
    await setFiles(page, 'upload-input-id-card', ['id-card.pdf']);
    await expect(tid(page, 'file-item')).toHaveCount(1);
    await setFiles(page, 'upload-input-extra', [...multi]);
    await expect(tid(page, 'file-item')).toHaveCount(5);
    for (const name of multi) await expect(rowBy(page, 'file-item', 'data-name', name)).toHaveAttribute('data-doc-key', 'extra');
  });

  await test.step('count: 6th file multi-5.pdf → FILE_COUNT · file-item stays 5 · API 400 FILE_COUNT', async () => {
    const before = await draftJson(somchai, uiDraft);
    await setFiles(page, 'upload-input-extra', ['multi-5.pdf']);
    await expect(tid(page, 'upload-error')).toHaveText(MSG.FILE_COUNT);
    await expect(tid(page, 'file-item')).toHaveCount(5);
    await expect(rowBy(page, 'file-item', 'data-name', 'multi-5.pdf')).toHaveCount(0);
    expect(await draftJson(somchai, uiDraft)).toEqual(before);

    const { draftId } = await createDraft(somchai, { serviceId: 'SV-01', qty: 1 });
    await attach(somchai, draftId, 'id-card', 'id-card.pdf');
    for (const name of multi) await attach(somchai, draftId, 'extra', name);
    const apiBefore = await draftJson(somchai, draftId);
    await expectError(await uploadFile(somchai, draftId, 'extra', 'multi-5.pdf'), 400, 'FILE_COUNT');
    expect(await draftJson(somchai, draftId)).toEqual(apiBefore);
  });

  await test.step('count: remove 1 file then attach multi-5.pdf → accepted · file-item 5', async () => {
    await removeFile(page, 'multi-1.pdf');
    await expect(tid(page, 'file-item')).toHaveCount(4);
    await setFiles(page, 'upload-input-extra', ['multi-5.pdf']);
    await expect(rowBy(page, 'file-item', 'data-name', 'multi-5.pdf')).toHaveCount(1);
    await expect(tid(page, 'file-item')).toHaveCount(5);
  });
});

test('TC-UPLOAD-02 ชนิดไฟล์จากเนื้อไฟล์', async ({ cast }) => {
  test.setTimeout(240_000);
  const somchai = await cast.as('somchai');
  const { draftId: uiDraft } = await createDraft(somchai, { serviceId: 'SV-01', qty: 1 });
  let page = await openUploadStep(somchai, uiDraft);
  await expect(tid(page, 'file-item')).toHaveCount(0);

  for (const name of ['ok-id.pdf', 'real.jpg', 'real.png'] as const) {
    await test.step(`${name}: real content accepted · API 201`, async () => {
      await setFiles(page, 'upload-input-id-card', [name]);
      await expect(tid(page, 'file-item')).toHaveCount(1);
      await expect(rowBy(page, 'file-item', 'data-name', name)).toHaveAttribute('data-doc-key', 'id-card');
      await expect(tid(page, 'upload-error')).toBeHidden();
      await removeFile(page, name);
      await expect(tid(page, 'file-item')).toHaveCount(0);

      const { draftId } = await createDraft(somchai, { serviceId: 'SV-01', qty: 1 });
      await attach(somchai, draftId, 'id-card', name);
    });
  }

  const fakePdfAsPdf: TestFile = { ...testFile('fake-text.pdf'), mimeType: 'application/pdf' };
  const rejected: ReadonlyArray<{ label: string; file: TestFileName | TestFile }> = [
    { label: 'fake-text.pdf (text "hello")', file: 'fake-text.pdf' },
    { label: 'fake-text.jpg (text)', file: 'fake-text.jpg' },
    { label: 'exe-as.png (MZ header)', file: 'exe-as.png' },
    { label: 'notes.txt (text)', file: 'notes.txt' },
    { label: 'fake-text.pdf sent with mimeType application/pdf', file: fakePdfAsPdf },
  ];
  const { draftId: apiDraft } = await createDraft(somchai, { serviceId: 'SV-01', qty: 1 });

  for (const row of rejected) {
    await test.step(`${row.label}: rejected · FILE_TYPE · not stored`, async () => {
      // Fresh wizard so a previous identical upload-error cannot satisfy this row.
      page = await openUploadStep(somchai, uiDraft);
      await expect(tid(page, 'upload-error')).toBeHidden();
      const before = await draftJson(somchai, uiDraft);
      await setFiles(page, 'upload-input-id-card', [row.file]);
      await expect(tid(page, 'upload-error')).toHaveText(MSG.FILE_TYPE);
      await expect(tid(page, 'file-item')).toHaveCount(0);
      expect(await draftJson(somchai, uiDraft)).toEqual(before);

      const apiBefore = await draftJson(somchai, apiDraft);
      await expectError(await uploadFile(somchai, apiDraft, 'id-card', row.file), 400, 'FILE_TYPE');
      expect(await draftJson(somchai, apiDraft)).toEqual(apiBefore);
    });
  }

  await test.step('rejected files were never stored: file-item 0', async () => {
    page = await openUploadStep(somchai, uiDraft);
    await expect(tid(page, 'file-item')).toHaveCount(0);
  });
});

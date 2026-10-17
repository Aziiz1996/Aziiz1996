import test from 'node:test';
import assert from 'node:assert/strict';
import { CV_MAX_BYTES, PHOTO_INPUT_MAX_BYTES, PROFILE_PHOTO_MAX_BYTES, dataURLToFile, isValidAttachment, prepareCvAttachment, profileAsText, validatePdfUpload, validatePhotoUpload } from '../src/profileFiles.ts';
import type { Attachment, StudentProfile } from '../src/types.ts';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1]);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 0]);
const pdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
function attachment(bytes: Uint8Array = pdf, mime = 'application/pdf', name = 'cv.pdf'): Attachment {
  return { name, mime, size: bytes.length, dataUrl: `data:${mime};base64,${btoa(String.fromCharCode(...bytes))}`, updatedAt: '2026-10-17T12:00:00.000Z' };
}
function profile(): StudentProfile {
  return { fullName: '', email: '', phone: '', city: '', headline: '', summary: '', university: '', major: '', graduationYear: '', education: '', experience: '', skills: [], linkedin: '', website: '' };
}

test('photo signature checks support JPEG, PNG and WebP including untyped mobile files', async () => {
  assert.equal(await validatePhotoUpload(new File([jpeg], 'photo.jpg', { type: 'image/jpeg' })), 'image/jpeg');
  assert.equal(await validatePhotoUpload(new File([png], 'photo.png', { type: 'image/png' })), 'image/png');
  assert.equal(await validatePhotoUpload(new File([webp], 'photo.webp', { type: 'image/webp' })), 'image/webp');
  assert.equal(await validatePhotoUpload(new File([jpeg], 'photo.JPEG')), 'image/jpeg');
});

test('photo checks reject SVG, disguised HTML, MIME mismatches and unsupported HEIC', async () => {
  await assert.rejects(validatePhotoUpload(new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'photo.svg', { type: 'image/svg+xml' })));
  await assert.rejects(validatePhotoUpload(new File(['<html>test</html>'], 'photo.jpg', { type: 'image/jpeg' })));
  await assert.rejects(validatePhotoUpload(new File([png], 'photo.jpg', { type: 'image/jpeg' })));
  await assert.rejects(validatePhotoUpload(new File([jpeg], 'photo.heic', { type: 'image/heic' })));
  await assert.rejects(validatePhotoUpload(new File([jpeg], 'photo.unknown')));
});

test('empty and oversized uploads fail before file contents are read', async () => {
  let reads = 0;
  const oversized = (size: number) => ({ name: 'file.pdf', type: 'application/pdf', size, arrayBuffer: async () => { reads++; return pdf.buffer; } });
  await assert.rejects(validatePdfUpload(oversized(0)));
  await assert.rejects(validatePdfUpload(oversized(CV_MAX_BYTES + 1)));
  await assert.rejects(validatePhotoUpload({ ...oversized(PHOTO_INPUT_MAX_BYTES + 1), name: 'image.jpg', type: 'image/jpeg' }));
  assert.equal(reads, 0);
});

test('PDF validation requires matching bytes and MIME, accepting an untyped mobile PDF', async () => {
  await validatePdfUpload(new File([pdf], 'cv.pdf', { type: 'application/pdf' }));
  await validatePdfUpload(new File([pdf], 'CV.PDF'));
  await assert.rejects(validatePdfUpload(new File(['<script>alert(1)</script>'], 'cv.pdf', { type: 'application/pdf' })));
  await assert.rejects(validatePdfUpload(new File([pdf], 'cv.pdf', { type: 'text/html' })));
  await assert.rejects(validatePdfUpload(new File([pdf], 'cv.txt')));
  await assert.rejects(validatePdfUpload({ name: 'cv.pdf', type: '', size: pdf.length + 1, arrayBuffer: async () => pdf.buffer }));
});

test('CV upload produces serializable metadata and a real File with unchanged bytes', async () => {
  const prepared = await prepareCvAttachment(new File([pdf], 'cv.pdf'));
  assert.equal(prepared.mime, 'application/pdf');
  assert.equal(prepared.size, pdf.length);
  assert.ok(Number.isFinite(Date.parse(prepared.updatedAt)));
  const restored = JSON.parse(JSON.stringify(prepared));
  assert.ok(isValidAttachment(restored, 'cv'));
  const file = dataURLToFile(restored);
  assert.ok(file instanceof File);
  assert.equal(file.type, 'application/pdf');
  assert.equal(file.name, 'cv.pdf');
  assert.equal(file.size, pdf.length);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), pdf);
  const missingExtension = await prepareCvAttachment(new File([pdf], 'resume', { type: 'application/pdf' }));
  assert.equal(missingExtension.name, 'resume.pdf');
});

test('attachment validation rejects inconsistent metadata, unsafe URLs and invalid names', () => {
  const original = attachment();
  assert.ok(isValidAttachment(original, 'cv'));
  assert.ok(!isValidAttachment(original, 'photo'));
  assert.ok(!isValidAttachment(null, 'cv'));
  for (const patch of [
    { size: original.size + 1 }, { size: -1 }, { size: CV_MAX_BYTES + 1 },
    { mime: 'text/html' }, { dataUrl: 'javascript:alert(1)' },
    { dataUrl: original.dataUrl.replace('application/pdf', 'text/html') },
    { dataUrl: 'data:application/pdf;base64,not-a-valid-value' },
    { dataUrl: original.dataUrl + '=' }, { updatedAt: 'invalid' },
    { name: '../cv.pdf' }, { name: 'file\u0000.pdf' }, { name: '' },
  ]) {
    const invalid = { ...original, ...patch };
    assert.ok(!isValidAttachment(invalid, 'cv'), JSON.stringify(patch));
    assert.throws(() => dataURLToFile(invalid));
  }
});

test('stored photos have a stricter cap and preserve a verified image signature', () => {
  assert.ok(isValidAttachment(attachment(jpeg, 'image/jpeg', 'photo.jpg'), 'photo'));
  assert.ok(isValidAttachment(attachment(png, 'image/png', 'photo.png'), 'photo'));
  assert.ok(!isValidAttachment(attachment(jpeg, 'image/png', 'photo.png'), 'photo'));
  const record = attachment(jpeg, 'image/jpeg', 'photo.jpg');
  assert.ok(!isValidAttachment({ ...record, size: PROFILE_PHOTO_MAX_BYTES + 1 }, 'photo'));
  assert.ok(!isValidAttachment({ ...record, dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' }, 'photo'));
});

test('plain text CV includes only provided sections and never invents qualifications', () => {
  assert.equal(profileAsText(profile()), '');
  const input = { ...profile(), fullName: 'اسم تجريبي', city: 'مدينة', university: 'جهة دراسة', skills: ['مهارة أولى', 'مهارة ثانية'] };
  const text = profileAsText(input);
  assert.match(text, /اسم تجريبي/);
  assert.match(text, /جهة دراسة/);
  assert.match(text, /مهارة أولى، مهارة ثانية/);
  assert.ok(!text.includes('الخبرات'));
  assert.ok(!text.includes('نبذة'));
  assert.ok(!text.includes('2027'));
  assert.deepEqual(input.skills, ['مهارة أولى', 'مهارة ثانية']);
});

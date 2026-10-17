import type { Attachment, StudentProfile } from './types';

export const PHOTO_INPUT_MAX_BYTES = 8 * 1024 * 1024;
export const PROFILE_PHOTO_MAX_BYTES = 300 * 1024;
export const CV_MAX_BYTES = 2 * 1024 * 1024;
type PhotoMime = 'image/jpeg' | 'image/png' | 'image/webp';
interface UploadFile { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer>; }

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}
function photoMime(bytes: Uint8Array): PhotoMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (startsWith(bytes, [82, 73, 70, 70]) && startsWith(bytes, [87, 69, 66, 80], 8)) return 'image/webp';
  return null;
}
const isPdf = (bytes: Uint8Array) => startsWith(bytes, [37, 80, 68, 70, 45]);
const photoExtension = /\.(?:jpe?g|png|webp)$/i;
function checkSize(file: UploadFile, maximum: number, message: string): void {
  if (!Number.isInteger(file.size) || file.size <= 0) throw new Error('الملف فارغ أو غير قابل للقراءة. اختر ملفاً آخر.');
  if (file.size > maximum) throw new Error(message);
}
async function readBytes(file: UploadFile): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size) throw new Error('تعذّرت قراءة الملف كاملاً. اختره من جهازك مرة أخرى.');
  return bytes;
}
export async function validatePhotoUpload(file: UploadFile): Promise<PhotoMime> {
  checkSize(file, PHOTO_INPUT_MAX_BYTES, 'الصورة أكبر من ٨ ميجابايت. اختر صورة JPEG أو PNG أو WebP أصغر.');
  if (file.type && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('اختر صورة JPEG أو PNG أو WebP. صور HEIC وSVG غير مدعومة؛ صدّرها بصيغة JPEG أولاً.');
  const detected = photoMime(await readBytes(file));
  if (!detected || (file.type && file.type !== detected) || (!file.type && !photoExtension.test(file.name))) throw new Error('محتوى الصورة لا يطابق نوعها. اختر صورة JPEG أو PNG أو WebP صالحة.');
  return detected;
}
export async function validatePdfUpload(file: UploadFile): Promise<void> {
  checkSize(file, CV_MAX_BYTES, 'ملف السيرة أكبر من ٢ ميجابايت. احفظ نسخة PDF أصغر ثم أعد المحاولة.');
  if ((file.type && file.type !== 'application/pdf') || (!file.type && !/\.pdf$/i.test(file.name)) || !isPdf(await readBytes(file))) throw new Error('اختر ملف PDF صالحاً للسيرة الذاتية. تغيير امتداد الملف وحده لا يحوّله إلى PDF.');
}
function safeName(name: string, fallback: string): string {
  return name.split(/[\\/]/).at(-1)?.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 170) || fallback;
}
function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
async function asAttachment(blob: Blob, name: string): Promise<Attachment> {
  return { name, mime: blob.type, size: blob.size, dataUrl: `data:${blob.type};base64,${base64(new Uint8Array(await blob.arrayBuffer()))}`, updatedAt: new Date().toISOString() };
}
export async function prepareCvAttachment(file: File): Promise<Attachment> {
  await validatePdfUpload(file);
  // Set the MIME explicitly: some mobile file pickers supply an empty File.type.
  const blob = new Blob([await file.arrayBuffer()], { type: 'application/pdf' });
  const name = safeName(file.name, 'cv.pdf');
  return asAttachment(blob, /\.pdf$/i.test(name) ? name : `${name}.pdf`);
}
export async function prepareProfilePhoto(file: File): Promise<Attachment> {
  await validatePhotoUpload(file);
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('تعذّر فتح الصورة. اختر صورة أخرى بصيغة JPEG أو PNG أو WebP.'));
      element.src = url;
    });
    const width = image.naturalWidth; const height = image.naturalHeight;
    if (!width || !height || width * height > 40_000_000 || width > 12000 || height > 12000) throw new Error('أبعاد الصورة كبيرة جداً أو غير صالحة. اختر نسخة أصغر.');
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('هذا المتصفح لا يدعم تجهيز الصور. جرّب متصفحاً أحدث.');
    const side = Math.min(width, height);
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, 512, 512);
    context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, 512, 512);
    for (const quality of [0.86, 0.72, 0.56, 0.4]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob?.type === 'image/jpeg' && blob.size > 0 && blob.size <= PROFILE_PHOTO_MAX_BYTES) {
        const original = safeName(file.name, 'profile').replace(/\.[^.]+$/, '');
        return await asAttachment(blob, `${original.slice(0, 160)}.jpg`);
      }
    }
    throw new Error('تعذّر تصغير الصورة للحجم المسموح. اختر صورة أبسط أو أصغر.');
  } finally { URL.revokeObjectURL(url); }
}

function attachmentBytes(attachment: Attachment, kind?: 'photo' | 'cv'): Uint8Array {
  if (typeof attachment !== 'object' || attachment === null || typeof attachment.name !== 'string' || !attachment.name.trim() || attachment.name.length > 180 || /[\u0000-\u001f\u007f\\/]/.test(attachment.name) || typeof attachment.updatedAt !== 'string' || !Number.isFinite(Date.parse(attachment.updatedAt))) throw new Error('بيانات الملف غير صالحة. أعد رفع الملف الأصلي.');
  const pdf = attachment.mime === 'application/pdf';
  const image = ['image/jpeg', 'image/png', 'image/webp'].includes(attachment.mime);
  if ((!pdf && !image) || (kind === 'cv' && !pdf) || (kind === 'photo' && !image)) throw new Error('نوع الملف غير مدعوم.');
  const maximum = pdf ? CV_MAX_BYTES : PROFILE_PHOTO_MAX_BYTES;
  if (!Number.isInteger(attachment.size) || attachment.size <= 0 || attachment.size > maximum || typeof attachment.dataUrl !== 'string') throw new Error('حجم الملف غير صالح.');
  const prefix = `data:${attachment.mime};base64,`;
  if (!attachment.dataUrl.startsWith(prefix)) throw new Error('محتوى الملف لا يطابق نوعه.');
  const encoded = attachment.dataUrl.slice(prefix.length);
  if (encoded.length > Math.ceil(maximum / 3) * 4 || !encoded.length || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('محتوى الملف غير صالح.');
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (bytes.length !== attachment.size || (pdf ? !isPdf(bytes) : photoMime(bytes) !== attachment.mime)) throw new Error('محتوى الملف لا يطابق بياناته. أعد رفع الملف الأصلي.');
  return bytes;
}
export function isValidAttachment(value: unknown, kind: 'photo' | 'cv'): value is Attachment {
  try { attachmentBytes(value as Attachment, kind); return true; } catch { return false; }
}
export function dataURLToFile(attachment: Attachment): File {
  const bytes = attachmentBytes(attachment);
  return new File([bytes as Uint8Array<ArrayBuffer>], attachment.name, { type: attachment.mime, lastModified: Date.parse(attachment.updatedAt) });
}
export const attachmentFile = dataURLToFile;
export function downloadAttachment(attachment: Attachment): void {
  const file = dataURLToFile(attachment); const url = URL.createObjectURL(file);
  const link = document.createElement('a'); link.href = url; link.download = file.name;
  document.body.appendChild(link); link.click(); link.remove();
  // A delay allows iOS and Android to consume the URL before it is revoked.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export function profileAsText(profile: StudentProfile): string {
  const sections: string[] = [];
  if (profile.fullName.trim()) sections.push(profile.fullName.trim());
  if (profile.headline.trim()) sections.push(profile.headline.trim());
  const contact = [profile.email, profile.phone, profile.city, profile.linkedin, profile.website].map(value => value.trim()).filter(Boolean);
  if (contact.length) sections.push(contact.join('\n'));
  if (profile.summary.trim()) sections.push(`نبذة\n${profile.summary.trim()}`);
  const education = [profile.university, profile.major, profile.graduationYear, profile.education].map(value => value.trim()).filter(Boolean);
  if (education.length) sections.push(`التعليم\n${education.join('\n')}`);
  if (profile.experience.trim()) sections.push(`الخبرات والمشروعات\n${profile.experience.trim()}`);
  if (profile.skills.length) sections.push(`المهارات\n${profile.skills.map(skill => skill.trim()).filter(Boolean).join('، ')}`);
  return sections.join('\n\n');
}

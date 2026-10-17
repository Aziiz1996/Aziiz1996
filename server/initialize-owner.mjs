import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeOwner } from './owner.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const account = await initializeOwner({ root, username: process.env.MADAR_OWNER_USERNAME || 'Aziiz1996' });
  console.log(account.created ? 'تم إنشاء حساب المالك. بيانات الدخول في الملف الخاص .madar/owner-credentials.txt.' : 'حساب المالك موجود؛ لم تتغير بيانات الدخول.');
} catch {
  console.error('تعذّر تهيئة حساب المالك. راجع صلاحيات مجلد .madar وصحة الملف الحالي.');
  process.exitCode = 1;
}

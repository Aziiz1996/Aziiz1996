import { fillApplicationProfile } from './fill.js';

const STORAGE_KEY = 'madarApplicationProfileV1';
const MAX_CV = 2 * 1024 * 1024;
const fileInput = document.getElementById('profile-file');
const fillButton = document.getElementById('fill');
const clearButton = document.getElementById('clear');
const status = document.getElementById('status');
let profile = null;
let busy = false;

function message(text, error = false) {
  status.textContent = text;
  status.dataset.error = String(error);
}

function validatePackage(value) {
  if (!value || !['az-logistics-application-profile', 'madar-application-profile'].includes(value.format) || value.version !== 1 || !value.profile || typeof value.profile !== 'object' || Array.isArray(value.profile)) {
    throw new Error('اختر ملف بيانات التقديم الذي صدّرته من عز اللوجستيات.');
  }
  const source = value.profile;
  const clean = {};
  const fields = ['fullName', 'email', 'phone', 'city', 'headline', 'summary', 'university', 'major', 'graduationYear', 'education', 'experience', 'linkedin', 'website'];
  for (const key of fields) {
    if (source[key] !== undefined && typeof source[key] !== 'string') throw new Error('أحد حقول الملف غير صالح. أعد تصديره من عز اللوجستيات.');
    clean[key] = (source[key] || '').trim().slice(0, 10000);
  }
  if (source.skills !== undefined && (!Array.isArray(source.skills) || source.skills.some(skill => typeof skill !== 'string'))) throw new Error('قائمة المهارات غير صالحة.');
  clean.skills = (source.skills || []).slice(0, 100).map(skill => skill.trim().slice(0, 100));
  if (!Object.values(clean).some(value => typeof value === 'string' ? value : value.length)) throw new Error('الملف فارغ. أضف بياناتك في عز اللوجستيات أولاً.');
  if (source.cv) {
    const cv = source.cv;
    if (typeof cv.dataUrl !== 'string' || cv.dataUrl.length > 2800000 || !/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/.test(cv.dataUrl)
      || cv.mime !== 'application/pdf' || typeof cv.name !== 'string' || !/\.pdf$/i.test(cv.name)
      || !Number.isInteger(cv.size) || cv.size < 8 || cv.size > MAX_CV) throw new Error('السيرة يجب أن تكون ملف PDF صالحاً بحجم لا يتجاوز ٢ ميغابايت.');
    let raw;
    try { raw = atob(cv.dataUrl.slice(cv.dataUrl.indexOf(',') + 1)); } catch { throw new Error('تعذّر قراءة ملف السيرة. أعد رفعه في عز اللوجستيات.'); }
    if (raw.length !== cv.size || !raw.startsWith('%PDF-')) throw new Error('محتوى السيرة غير صالح. أعد رفع ملف PDF في عز اللوجستيات.');
    clean.cv = { name: cv.name.split(/[\\/]/).pop().slice(0, 180), mime: 'application/pdf', size: cv.size, dataUrl: cv.dataUrl, updatedAt: typeof cv.updatedAt === 'string' ? cv.updatedAt.slice(0, 40) : '' };
  }
  return clean;
}

function render() {
  document.getElementById('profile-info').hidden = !profile;
  document.getElementById('profile-name').textContent = profile?.fullName || 'بيانات التقديم';
  document.getElementById('profile-cv').textContent = profile?.cv ? `السيرة: ${profile.cv.name} · ${Math.ceil(profile.cv.size / 1024)} كيلوبايت` : 'لم تُضف سيرة PDF. ستُعبّأ البيانات المتاحة.';
  fillButton.disabled = !profile || busy;
  clearButton.disabled = !profile || busy;
  fileInput.disabled = busy;
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  busy = true;
  render();
  try {
    if (file.size > 3 * 1024 * 1024) throw new Error('ملف البيانات أكبر من ٣ ميغابايت. استخدم سيرة PDF لا تتجاوز ٢ ميغابايت.');
    let value;
    try { value = JSON.parse(await file.text()); } catch { throw new Error('ملف JSON غير صالح. أعد تصدير بيانات التقديم من عز اللوجستيات.'); }
    const candidate = validatePackage(value);
    await chrome.storage.local.set({ [STORAGE_KEY]: candidate });
    profile = candidate;
    message('حُفظت البيانات محلياً. افتح نموذج التقديم ثم اضغط تعبئة الصفحة الحالية.');
  } catch (error) {
    message(error instanceof Error ? error.message : 'تعذّر استيراد البيانات.', true);
  } finally {
    busy = false;
    fileInput.value = '';
    render();
  }
});

clearButton.addEventListener('click', async () => {
  busy = true;
  render();
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
    profile = null;
    message('حُذفت البيانات من الإضافة.');
  } catch { message('تعذّر حذف البيانات. أعد المحاولة.', true); }
  finally { busy = false; render(); }
});

fillButton.addEventListener('click', async () => {
  if (!profile || busy) return;
  busy = true;
  render();
  message('جارٍ تعبئة الحقول المتاحة…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\//i.test(tab.url || '')) throw new Error('افتح نموذج التقديم في موقع ويب عادي ثم أعد المحاولة.');
    const outputs = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fillApplicationProfile, args: [profile] });
    const result = outputs[0]?.result;
    if (!result || typeof result.filled !== 'number') throw new Error('لم يصل رد من الصفحة. أعد فتح نموذج التقديم.');
    const cvMessages = {
      attached: 'أُرفق ملف السيرة.', existing: 'يوجد ملف مرفق سابقاً؛ احتُفظ به.', unsupported: 'حقل السيرة لا يقبل PDF؛ أرفق الملف المناسب يدوياً.',
      'no-field': 'لم يوجد حقل سيرة واضح؛ أرفقها يدوياً عند الحاجة.', invalid: 'تعذّر التحقق من السيرة؛ أعد استيراد ملف صحيح.', failed: 'تعذّر إرفاق السيرة؛ أرفقها يدوياً.', 'not-provided': ''
    };
    message(`عُبّئ ${result.filled} من الحقول الفارغة وتُرك ${result.skipped} حقلاً. ${cvMessages[result.cv] || ''} راجع الصفحة والملف وأكمل الإرسال بنفسك.`);
  } catch (error) {
    const known = error instanceof Error && /^[\u0600-\u06ff]/.test(error.message);
    message(known ? error.message : 'تعذّر الوصول إلى هذه الصفحة. بعض المواقع والإطارات تمنع التعبئة؛ انسخ بياناتك وارفع السيرة يدوياً.', true);
  } finally { busy = false; render(); }
});

try {
  const saved = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  if (saved) profile = validatePackage({ format: 'az-logistics-application-profile', version: 1, profile: saved });
} catch { message('تعذّر قراءة البيانات المحفوظة. استورد الملف من عز اللوجستيات مجدداً.', true); }
render();

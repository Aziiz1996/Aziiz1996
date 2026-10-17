// This function must stay self-contained: Chrome serializes it into the active page.
export async function fillApplicationProfile(profile) {
  const result = { filled: 0, skipped: 0, cv: 'not-provided', fields: [] };
  if (!profile || typeof profile !== 'object') return result;
  const normalize = value => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2')
    .normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').trim().replace(/\s+/g, ' ');
  const text = key => typeof profile[key] === 'string' ? profile[key].trim().slice(0, 10000) : '';
  const values = {
    fullName: text('fullName'), email: text('email'), phone: text('phone'), city: text('city'),
    headline: text('headline'), summary: text('summary'), university: text('university'),
    major: text('major'), graduationYear: text('graduationYear'), education: text('education'),
    experience: text('experience'), linkedin: text('linkedin'), website: text('website'),
    skills: Array.isArray(profile.skills) ? profile.skills.filter(item => typeof item === 'string').slice(0, 100).join('، ').slice(0, 10000) : ''
  };
  const rules = [
    ['email', ['email', 'email address', 'e mail', 'e mail address', 'البريد الالكتروني', 'بريد الكتروني', 'الايميل', 'ايميل']],
    ['phone', ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'mobile number', 'contact number', 'رقم الهاتف', 'الهاتف', 'رقم الجوال', 'الجوال', 'رقم التواصل']],
    ['fullName', ['name', 'full name', 'fullname', 'applicant name', 'candidate name', 'your name', 'الاسم', 'الاسم الكامل', 'الاسم الرباعي', 'اسم المتقدم', 'اسم الطالب']],
    ['city', ['city', 'town', 'residence city', 'city of residence', 'المدينه', 'مدينه السكن', 'مدينه الاقامه']],
    ['headline', ['headline', 'professional title', 'job title', 'المسمي الوظيفي', 'العنوان المهني']],
    ['summary', ['summary', 'professional summary', 'personal summary', 'about me', 'about yourself', 'bio', 'نبذه', 'نبذه شخصيه', 'نبذه عني', 'الملخص المهني']],
    ['university', ['university', 'university name', 'college', 'school', 'school name', 'الجامعه', 'اسم الجامعه', 'الكليه', 'المؤسسه التعليميه']],
    ['major', ['major', 'specialization', 'field of study', 'التخصص', 'التخصص الدراسي', 'تخصص']],
    ['graduationYear', ['graduation year', 'year of graduation', 'سنه التخرج', 'عام التخرج']],
    ['education', ['education', 'education details', 'qualifications', 'academic qualifications', 'التعليم', 'المؤهلات', 'المؤهلات العلميه', 'المؤهل العلمي']],
    ['experience', ['experience', 'work experience', 'professional experience', 'employment history', 'الخبره', 'الخبرات', 'الخبره العمليه', 'الخبرات العمليه']],
    ['skills', ['skills', 'skill', 'competencies', 'key skills', 'المهارات', 'مهارات']],
    ['linkedin', ['linkedin', 'linkedin url', 'linkedin profile', 'linkedin profile url', 'لينكد ان', 'لينكدان', 'رابط لينكد ان']],
    ['website', ['website', 'website url', 'personal website', 'portfolio', 'portfolio url', 'الموقع الالكتروني', 'الموقع الشخصي', 'رابط الموقع', 'معرض الاعمال']]
  ].map(([key, aliases]) => [key, aliases.map(normalize)]);
  const labels = field => {
    const associated = Array.from(field.labels || []).map(label => label.textContent || '');
    const labelled = (field.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '');
    return [...associated, ...labelled, field.getAttribute('aria-label') || '', field.getAttribute('placeholder') || ''];
  };
  const visible = field => {
    if (typeof field.checkVisibility === 'function' && !field.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const style = window.getComputedStyle(field);
    return field.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.opacity !== '0';
  };
  const descriptors = field => [field.name, field.id, ...labels(field)].filter(Boolean).map(normalize);
  const blocked = descriptors => descriptors.some(value => /(?:password|passcode|captcha|recaptcha|verification|otp|one time|security code|secret|username|user name|login|كلمه المرور|كلمات المرور|رمز التحقق|رمز الامان|اسم المستخدم|تسجيل الدخول|موافقه|اقرار)/.test(value));
  const detect = field => {
    const descriptions = descriptors(field);
    if (blocked(descriptions)) return '';
    // A generic `name` identifier also occurs in employer/referee forms.
    if (descriptions.some(value => /(?:company name|employer name|reference name|referee name|father name|mother name|spouse name|emergency contact|اسم الشركه|اسم صاحب العمل|اسم الاب|اسم الام|اسم المرجع|ولي الامر|جهات اتصال الطوارئ)/.test(value))) return '';
    const autocomplete = (field.autocomplete || '').trim().toLowerCase().split(/\s+/).pop();
    if (['username', 'current-password', 'new-password', 'one-time-code'].includes(autocomplete)) return '';
    const autocompletes = { name: 'fullName', email: 'email', tel: 'phone', 'address-level2': 'city', organization: 'university', url: 'website' };
    // Organization can also mean an employer. Only use it with an education label.
    if (autocomplete === 'organization' && !descriptions.some(value => /university|college|school|جامعه|كليه/.test(value))) return '';
    for (const description of descriptions) {
      const clean = description.replace(/\b(required|optional)\b/g, '').replace(/(?:اختياري|مطلوب|الزامي)/g, '').trim();
      for (const [key, aliases] of rules) if (aliases.includes(clean) || aliases.some(alias => clean.replace(/\s/g, '') === alias.replace(/\s/g, ''))) return key;
    }
    if (autocompletes[autocomplete]) return autocompletes[autocomplete];
    return '';
  };
  const dispatch = field => {
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  };
  let cvFile = null;
  if (profile.cv) {
    result.cv = 'invalid';
    try {
      const cv = profile.cv;
      if (typeof cv.dataUrl !== 'string' || !/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/.test(cv.dataUrl)
        || cv.dataUrl.length > 2800000 || cv.mime !== 'application/pdf' || typeof cv.name !== 'string'
        || !/\.pdf$/i.test(cv.name) || !Number.isInteger(cv.size) || cv.size < 8 || cv.size > 2 * 1024 * 1024) throw new Error('invalid PDF');
      const raw = atob(cv.dataUrl.slice(cv.dataUrl.indexOf(',') + 1));
      if (raw.length !== cv.size || !raw.startsWith('%PDF-')) throw new Error('invalid PDF bytes');
      const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
      const name = cv.name.split(/[\\/]/).pop().slice(0, 180);
      cvFile = new File([bytes], name, { type: 'application/pdf' });
      result.cv = 'no-field';
    } catch { /* An invalid attachment must never be placed in a form. */ }
  }
  for (const field of document.querySelectorAll('input, textarea, select')) {
    if (!visible(field) || field.matches(':disabled') || field.readOnly || field.closest('[inert]')) { result.skipped++; continue; }
    const type = (field.type || '').toLowerCase();
    if (type === 'file') {
      const descriptions = descriptors(field);
      const isCV = descriptions.some(value => /(?:\bresume\b|\bcv\b|curriculum vitae|السيره الذاتيه|سيره ذاتيه|سي في)/.test(value));
      const otherDocument = descriptions.some(value => /(?:photo|picture|passport|certificate|cover letter|transcript|صوره|شهاده|هويه|جواز)/.test(value));
      if (!isCV || otherDocument || !cvFile || blocked(descriptions)) { result.skipped++; continue; }
      if (field.files?.length) { if (result.cv !== 'attached') result.cv = 'existing'; result.skipped++; continue; }
      const accepted = (field.accept || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
      if (accepted.length && !accepted.some(value => ['.pdf', 'application/pdf', 'application/*', '*/*'].includes(value))) {
        if (result.cv !== 'attached') result.cv = 'unsupported'; result.skipped++; continue;
      }
      try {
        const transfer = new DataTransfer();
        transfer.items.add(cvFile);
        field.files = transfer.files;
        dispatch(field);
        if (field.isConnected && field.files?.length && field.files[0].name === cvFile.name) { result.cv = 'attached'; result.filled++; result.fields.push('cv'); }
        else { if (result.cv !== 'attached') result.cv = 'failed'; result.skipped++; }
      } catch { if (result.cv !== 'attached') result.cv = 'failed'; result.skipped++; }
      continue;
    }
    if (!['text', 'email', 'tel', 'url', 'number', 'textarea', 'select-one'].includes(type) || String(field.value || '').trim()) { result.skipped++; continue; }
    const key = detect(field);
    const value = values[key];
    if (!key || !value || (field.maxLength > -1 && value.length > field.maxLength)) { result.skipped++; continue; }
    let target = value;
    if (type === 'select-one') {
      const option = Array.from(field.options).find(option => !option.disabled && option.value && (normalize(option.value) === normalize(value) || normalize(option.textContent) === normalize(value)));
      if (!option) { result.skipped++; continue; }
      target = option.value;
    }
    try {
      const prototype = type === 'textarea' ? HTMLTextAreaElement.prototype : type === 'select-one' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (!setter) { result.skipped++; continue; }
      setter.call(field, target);
      if (field.value !== target) { result.skipped++; continue; }
      dispatch(field);
      if (!field.isConnected || field.value !== target) { result.skipped++; continue; }
      result.filled++;
      result.fields.push(key);
    } catch { result.skipped++; }
  }
  return result;
}

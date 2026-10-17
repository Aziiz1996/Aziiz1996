import type { AppData, Page } from './types.ts';
import { LOGISTICS_TERMS, normalizeLogisticsSearch, shuffleTerms } from './logisticsTerms.ts';
import { PRACTICE_BANK, PRACTICE_QUESTIONS } from './practiceBank.ts';

export const TEACHER_NAME = 'تيتشر لوجستيك';
export const TEACHER_REFUSAL = 'أنا مساعدك في دبلوم اللوجستيات، ما أقدر أجاوب عن أشياء خارج المنهج والتخصص.';
export interface TeacherSource { id: string; label: string; kind: 'note' | 'bank' | 'term' | 'schedule' | 'educational' | 'availability'; page?: Page; excerpt?: string; }
export interface TeacherReply { kind: 'source' | 'educational' | 'refusal' | 'missing' | 'schedule' | 'news' | 'guide'; text: string; sources: TeacherSource[]; actions: { label: string; page: Page }[]; }
export interface TeacherQuizQuestion { id: string; question: string; options: { key: string; text: string }[]; answer: string; source: TeacherSource; }

const norm = normalizeLogisticsSearch;
const STOP = new Set(norm('ما ماذا ماهو ماهي هو هي هل كيف لي يا في من عن على الى إلى و او أو ثم انا ابي ابغى اريد ممكن وش ايش اشرح اشرحلي شرح اعطني علمني فهمني لو سمحت يعني الفرق بين ذكر اذكر مثال امثلة سؤال ملخص لخص هذا هذه ذلك عندي المادة مادة المحاضرة محاضرة').split(' '));
function tokens(value: string): string[] { return [...new Set(norm(value).split(' ').filter(word => word.length > 1 && !STOP.has(word)))]; }
function root(word: string) { return word.replace(/^(?:وال|بال|لل|ال)/u, '').replace(/(?:ات|ها|هم|نا|ين)$/u, ''); }
function overlap(query: string[], content: string): number {
  const words = tokens(content).map(root);
  return query.reduce((score, token) => score + (words.some(word => word === root(token) || (root(token).length >= 4 && word.startsWith(root(token)))) ? 1 : 0), 0);
}
const DOMAIN = /لوجست|مخزون|مخازن|مخزن|مستودع|مشتريات|مشتري|عقود|مناقص|نقل|شحن|سلاسل|سلسله|امداد|توريد|مورد|اداره الاعمال|اداره اعمال|المدارس الاداريه|مدرسه اداريه|رياده الاعمال|رياده اعمال|الكفاءه|الفعاليه|مناوله|تنبؤ|جرد|كميه الطلب|نقطه اعاده|مخزون الامان|وجست|logistics|inventory|warehouse|procurement|transport|shipping|supply chain|incoterms|fifo|fefo|\babc\b|\bjit\b/;
// A specialty word appended to an unrelated request must not unlock general answers.
const OFF_SCOPE = /طبخ|وصفه|كوره|كره القدم|مباراه|برشلونه|ريال مدريد|سياسه|انتخاب|الرئيس الامريكي|زواج|طلاق|علاقه عاطفيه|ابراج|برجي|نكت|قصيده|شعر غزل|مرض|علاج|تشخيص|دواء|اسهم|تداول|بتكوين|بيتكوين|برمجه|كود بايثون|جافاسكربت|حسابي البنكي|كلمه المرور|كلمات المرور|طب الاسنان|ريجيم|تنحيف|recipe|football|election|diagnos|bitcoin|password|javascript|python/;
const INJECTION = /تجاهل.{0,25}(تعليمات|قواعد|منهج)|انس.{0,15}(تعليمات|قواعد)|غير.{0,15}(دورك|هويتك)|خارج (المنهج|التخصص)|اكشف.{0,20}(تعليمات|سر|كلمه)|system prompt|ignore.{0,35}(instruction|rules|previous)|you are now|jailbreak|developer message/;
const COURSE_DOMAIN = /مخزون|مخازن|مشتريات|عقود|مناقص|نقل|شحن|اعمال|امداد|لوجست/;
function relevantCourses(data: AppData) { return data.courses.filter(course => COURSE_DOMAIN.test(norm(course.name))); }
function selectedCourses(data: AppData, query: string) {
  const q = tokens(query); const courses = relevantCourses(data);
  const scores = courses.map(course => ({ course, score: overlap(q, course.name) }));
  const max = Math.max(0, ...scores.map(row => row.score));
  return max > 0 ? scores.filter(row => row.score === max).map(row => row.course) : courses;
}
function sourceReply(kind: TeacherReply['kind'], text: string, sources: TeacherSource[] = [], actions: TeacherReply['actions'] = []): TeacherReply { return { kind, text, sources, actions }; }
const educationSource = (id: string, title: string): TeacherSource => ({ id: `lesson-${id}`, label: `${title} · شرح تعليمي عام، وليس نقلاً عن محاضرتك`, kind: 'educational', page: 'notes' });

interface Lesson { id: string; title: string; match: RegExp; content: string; check: string; }
export const TEACHER_LESSONS: readonly Lesson[] = [
  { id: 'reorder', title: 'نقطة إعادة الطلب ومخزون الأمان', match: /نقطه اعاده|اعاده الطلب|مخزون الامان|reorder|safety stock/,
    content: 'نقطة إعادة الطلب = متوسط الطلب اليومي × مدة التوريد بالأيام + مخزون الأمان. مثال تعليمي: نصرف ٢٠ وحدة يومياً، والتوريد ٥ أيام، ومخزون الأمان ٣٠ وحدة؛ النقطة = ٢٠ × ٥ + ٣٠ = ١٣٠ وحدة. إذا وصل رصيد المخزون المتاح وفق سياسة المنشأة لهذه النقطة نبدأ طلب التوريد. مخزون الأمان يغطي التقلبات؛ ما نحسبه عشوائياً ولا نخلط مدة التوريد بمدة التخزين.', check: 'جرّب: لو الطلب ١٠ وحدات والتوريد ٤ أيام ومخزون الأمان ٢٠، كم نقطة إعادة الطلب؟ حلّك للمراجعة: ٦٠ وحدة.' },
  { id: 'rotation', title: 'FIFO وFEFO', match: /fifo|fefo|الوارد اولا|انتهاء الصلاحيه|الاول اولا/,
    content: 'FIFO يعني الوارد أولاً يصرف أولاً: رتّب الصرف بتاريخ دخول الصنف. FEFO يعني الأقرب انتهاءً يصرف أولاً: رتّب الصرف بتاريخ الصلاحية. مثال: دفعة دخلت أمس وتنتهي قريباً، ودفعة قديمة تنتهي بعد سنة؛ FEFO يقدّم الدفعة الأقرب انتهاءً حتى لو وصلت متأخرة. طبّق سياسة السلامة المعتمدة لكل منتج.', check: 'اختبر فهمك: إذا الأهم تجنب انتهاء الصلاحية، أي طريقة تختار؟ FEFO.' },
  { id: 'abc', title: 'تصنيف ABC', match: /\babc\b|تصنيف (المخزون|الاصناف)/,
    content: 'تصنيف ABC يساعدك توجّه الرقابة للأصناف الأهم. معيار شائع هو قيمة الاستهلاك السنوي = الكمية السنوية × تكلفة الوحدة. رتّب الأصناف تنازلياً، ثم كوّن فئات A وB وC حسب سياسة المنشأة. A عادةً أصناف قليلة تستحوذ على حصة كبيرة من القيمة، فتحتاج متابعة أدق. النسب ليست قانوناً ثابتاً لكل منشأة، وقد تغيّر الأهمية الحرجة أولويات الرقابة.', check: 'اختبر فهمك: صنف رخيص لكنه يتعطل الإنتاج بدونه؛ هل القيمة المالية وحدها تكفي لتحديد أولويته؟ لا، نراعي أهمية التشغيل أيضاً.' },
  { id: 'jit', title: 'التوريد في الوقت المناسب JIT', match: /\bjit\b|الوقت المناسب|وقت الحاجه/,
    content: 'JIT يهدف لتوفير المواد وقت الحاجة وتقليل المخزون والهدر. تخيّل مصنعاً تصله القطع قرب وقت استخدامها بدل تخزين كميات كبيرة. نجاحه يحتاج مورّدين موثوقين وجودة واضحة وتنسيقاً جيداً؛ تأخر التوريد قد يوقف التشغيل. هو أسلوب إدارة، وليس وعداً بأن المخزون يصبح صفراً في كل منشأة.', check: 'اختبر فهمك: وش الخطر إذا اعتمدت على مورد يتأخر كثيراً مع مخزون قليل؟ احتمال نفاد المواد وتعطل العمل.' },
  { id: 'forecast', title: 'التنبؤ بالطلب', match: /تنبؤ|توقع الطلب|forecast/,
    content: 'التنبؤ الكمي يعتمد على بيانات مثل المبيعات السابقة، والنوعي يعتمد على تقديرات الخبراء أو العملاء. مثال تعليمي لمتوسط بسيط: طلب ثلاثة أسابيع ٢٠ و٣٠ و٤٠ وحدة، المتوسط = ٣٠ وحدة. التوقع ليس ضماناً؛ راجع الموسمية والاتجاه والأحداث الجديدة وقارن التوقع بالطلب الفعلي.', check: 'اختبر فهمك: إذا ما عندك تاريخ مبيعات لصنف جديد، هل آراء الخبراء تصير مفيدة؟ نعم، كتنبؤ نوعي مع متابعة النتائج.' },
  { id: 'inventory', title: 'الفرق بين إدارة المخزون وإدارة المخازن', match: /مخزون|مخازن|مستودع|مخزن|inventory|warehouse/,
    content: 'إدارة المخزون تسأل: كم عندنا؟ كم نحتاج؟ ومتى نطلب؟ إدارة المخازن تسأل: وين نحط الصنف؟ كيف نستلمه ونحفظه ونصرفه بأمان؟ مثال: قرار شراء ١٠٠ وحدة يتعلق بالمخزون، وتحديد الرف ومسار المناولة يتعلق بالمخازن. الجرد يقارن الرصيد المسجل بالموجود الفعلي، ثم نبحث سبب الفروقات.', check: 'اختبر فهمك: ترتيب الرفوف من إدارة المخزون أو المخازن؟ المخازن. تحديد كمية إعادة الطلب؟ المخزون.' },
  { id: 'procurement', title: 'دورة المشتريات والعقود والمناقصات', match: /مشتريات|عقد|عقود|مناقص|مورد|توريد|procurement/,
    content: 'ابدأ بتحديد الاحتياج والمواصفات، ثم البحث عن الموردين وطلب العروض، ومقارنة الجودة والتكلفة ومدة التوريد والمخاطر، ثم الترسية حسب السياسة المعتمدة وإصدار أمر الشراء أو العقد، فالاستلام والفحص ومطابقة المستندات والمتابعة. المناقصة طريقة منظمة للمنافسة وفق شروط معلنة؛ العقد يحدد التزامات الأطراف. أقل سعر وحده لا يكفي إذا كانت المواصفات أو الجودة غير مناسبة.', check: 'اختبر فهمك: مورد أرخص لكنه لا يلتزم بموعدك؛ وش تراجع؟ التكلفة الكلية والجودة ومدة التوريد ومخاطر التأخير.' },
  { id: 'transport', title: 'اختيار وسيلة النقل والشحن الدولي', match: /نقل|شحن|بحري|بري|جوي|transport|shipping/,
    content: 'وازن بين التكلفة والسرعة والموثوقية وطبيعة البضاعة والمسافة. الجوي غالباً أسرع وأعلى تكلفة، والبحري مناسب عادةً للكميات الكبيرة والمسافات الدولية مع زمن أطول، والبري مرن للتوصيل من الباب إلى الباب بحسب المسار. سند الشحن ووثائق الشحنة يختلف دورها حسب الوسيلة والعقد؛ لا نعتبر كل مستند بديلاً عن الآخر.', check: 'مثال: قطع خفيفة عاجلة لخط إنتاج متوقف؛ قد ترجّح الجوي إذا كانت تكلفة التوقف تبرر فرق الشحن. هذا استنتاج تعليمي يحتاج بيانات الحالة.' },
  { id: 'supply', title: 'تدفقات سلسلة الإمداد', match: /سلسله|سلاسل|امداد|supply chain|لوجست/,
    content: 'سلسلة الإمداد تربط المورد والتصنيع والتخزين والنقل والعميل. فيها تدفق مواد وخدمات، وتدفق معلومات مثل الطلب والتوقع، وتدفق مالي مثل المدفوعات. اللوجستيات تركز على حركة وتخزين الموارد والمعلومات المرتبطة بها داخل السلسلة. إذا تأخرت معلومات الطلب قد تشتري كمية غير مناسبة حتى لو كان المستودع منظماً.', check: 'اختبر فهمك: طلب العميل الإلكتروني أي تدفق؟ معلومات. وصول البضاعة؟ مواد. سداد الفاتورة؟ مالي.' },
  { id: 'business', title: 'مبادئ الإدارة والمدارس الإدارية', match: /اعمال|ادار|كفاءه|فعاليه|رياده|كلاسيكيه|علاقات انسانيه|مدرسه|مدارس/,
    content: 'وظائف الإدارة الشائعة: التخطيط والتنظيم والتوجيه والرقابة. الفعالية تعني تحقق الهدف، والكفاءة تعني استخدام الموارد بصورة مناسبة. لو وصلت الطلبية في الموعد بتكلفة أعلى من اللازم، تحقق الهدف لكن تحتاج تحسين الكفاءة. المدرسة الكلاسيكية تركز على التنظيم والعمل، والعلاقات الإنسانية على العامل والعلاقات، ومدخل النظم ينظر لترابط أجزاء المنظمة مع بيئتها؛ تفاصيل التسلسل المعتمد للاختبار ترجع لمحاضرتك ومفتاحها.', check: 'اختبر فهمك: ما فائدة توفير التكلفة إذا الطلبية لم تصل للعميل؟ قد تقل الموارد المستخدمة، لكن الهدف المطلوب لم يتحقق.' },
];

function findTerm(query: string) {
  const q = norm(query); const qTokens = q.split(' ');
  return LOGISTICS_TERMS.find(term => {
    const abbreviation = norm(term.abbreviation);
    const exactAbbreviation = abbreviation.includes(' ') ? q.includes(abbreviation) : qTokens.includes(abbreviation);
    return exactAbbreviation || q.includes(norm(term.english)) || (norm(term.arabic).length >= 5 && q.includes(norm(term.arabic)));
  });
}
function clock(value: string) { return /^\d{2}:\d{2}$/.test(value) ? `${value} (${Number(value.slice(0, 2)) >= 12 ? 'مساءً' : 'صباحاً'})` : 'الوقت غير مسجّل'; }
function dayLabel(day: number) { return ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][day] ?? 'يوم غير محدد'; }
function dateLabel(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(new Date(`${date}T12:00:00+03:00`));
}
export function teacherToday(now: Date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }

function scheduleAnswer(data: AppData, query: string, today: string): TeacherReply {
  const q = norm(query); const courses = selectedCourses(data, query); const ids = new Set(courses.map(course => course.id));
  const courseName = (id: string) => data.courses.find(course => course.id === id)?.name ?? 'مادة غير محددة';
  const allToday = /وش عندي اليوم/.test(q);
  const exams = /اختبار|امتحان|واجب|مشروع|تسليم|مهام|موعدي|مواعيد/.test(q) || allToday;
  const lectures = /محاضر|حضور|دوامي|دوام|جدول/.test(q) || allToday || !exams;
  const lines: string[] = []; const sources: TeacherSource[] = [];
  if (lectures) {
    let rows = data.lectures.filter(lecture => ids.has(lecture.courseId));
    if (/اليوم/.test(q)) rows = rows.filter(lecture => lecture.day === new Date(`${today}T12:00:00+03:00`).getUTCDay());
    for (const lecture of [...rows].sort((a, b) => a.day - b.day || (a.start ?? '').localeCompare(b.start ?? ''))) {
      lines.push(`• ${courseName(lecture.courseId)}: ${dayLabel(lecture.day)}، ${lecture.timePending ? 'وقت المحاضرة غير مؤكد؛ راجعه في الجدول' : `من ${clock(lecture.start)} إلى ${clock(lecture.end)}`}${lecture.location ? `، ${lecture.location}` : ''}.`);
      sources.push({ id: lecture.id, label: `جدولك المحفوظ · ${courseName(lecture.courseId)}`, kind: 'schedule', page: 'courses' });
    }
    if (!rows.length) lines.push('ما عندك محاضرات مسجلة تطابق هذا الطلب. ما أقدر أستنتج جدول الجامعة بدون بيانات.');
  }
  if (exams) {
    let rows = data.tasks.filter(task => ids.has(task.courseId));
    if (/اختبار|امتحان/.test(q)) rows = rows.filter(task => task.kind === 'exam');
    else if (/واجب/.test(q)) rows = rows.filter(task => task.kind === 'assignment');
    else if (/مشروع/.test(q)) rows = rows.filter(task => task.kind === 'project');
    if (/القادم|الجاي|اقرب|باقي/.test(q)) rows = rows.filter(task => task.due >= today && !task.completed);
    if (/اليوم/.test(q)) rows = rows.filter(task => task.due === today);
    for (const task of [...rows].sort((a, b) => a.due.localeCompare(b.due))) {
      lines.push(`• ${task.title}: ${dateLabel(task.due)}، ${task.time ? `${clock(task.time)}${task.endTime ? ` إلى ${clock(task.endTime)}` : '، وقت الانتهاء غير مسجّل'}` : 'الوقت غير محدد في بياناتك؛ ما راح أخمّنه'}${task.completed ? ' · منجز' : ''}.`);
      sources.push({ id: task.id, label: `مهامك المحفوظة · ${courseName(task.courseId)}`, kind: 'schedule', page: 'tasks' });
    }
    if (!rows.length) lines.push('ما عندي اختبار أو مهمة مسجّلة تطابق طلبك. راجع صفحة المهام أو أضف موعدك من الجامعة.');
  }
  return sourceReply('schedule', `أبشر، هذي المواعيد من بياناتك المحفوظة، بتوقيت السعودية:\n${lines.join('\n')}\nإذا تغيّر موعد في الجامعة حدّثه هنا عشان أرجع لك بالمعلومة الصحيحة.`, sources, [{ label: 'جدول المحاضرات', page: 'courses' }, { label: 'الاختبارات والمهام', page: 'tasks' }]);
}

/** Local retrieval plus curated educational explanations. No remote model, hidden browsing, or implied university access. */
export function answerTeacher(data: AppData, query: string, today = teacherToday()): TeacherReply {
  const trimmed = query.trim().slice(0, 2000); const q = norm(trimmed);
  if (!q) return sourceReply('guide', 'هلا بك، أنا تيتشر لوجستيك. اسألني عن مواد دبلوم اللوجستيات، جدولك، أو اختر تدريباً قصيراً.', [], [{ label: 'ابدأ خطة المذاكرة', page: 'plan' }]);
  if (INJECTION.test(q) || OFF_SCOPE.test(q)) return sourceReply('refusal', TEACHER_REFUSAL);
  const term = findTerm(trimmed);
  const isSchedule = /محاضراتي|دوامي|واجباتي|مهامي|اختباراتي|وش عندي اليوم/.test(q) || (/متي|متى|الساعه|توقيت|موعد|مواعيد|جدول|حضور/.test(q) && /اختبار|امتحان|محاضر|دوام|واجب|مشروع|تسليم|مهام|الجامعه|دراستي/.test(q));
  if (isSchedule) return scheduleAnswer(data, trimmed, today);
  if (/احدث|اخبار|جديد|مستجد|تحديثات|news|latest/.test(q)) {
    if (!DOMAIN.test(q) && !/التخصص|تخصصي|دراستي/.test(q)) return sourceReply('refusal', TEACHER_REFUSAL);
    return sourceReply('news', 'أبشر، جديد تخصصك له صفحة مستقلة تعرض المصدر وتاريخ الخبر. أنا هنا ما عندي تصفح مباشر، فما راح أسمي معلومة قديمة «آخر خبر». افتح مستجدات اللوجستيات وتأكد من المصدر والتاريخ؛ الخبر مو بديل عن محاضرتك.', [], [{ label: 'مستجدات اللوجستيات', page: 'updates' }]);
  }
  if (/توقع|خمن|متوقع|يجي|تجي/.test(q) && /اختبار|اسئله|امتحان/.test(q) && (DOMAIN.test(q) || /تخصص|مادتي|موادي/.test(q))) {
    const topics = /مخزون|مخازن/.test(q) ? ['فرّق بين إدارة المخزون وإدارة المخازن بمثال.', 'متى تستخدم WMS أو JIT أو تصنيف ABC؟', 'احسب نقطة إعادة الطلب من طلب يومي ومدة توريد ومخزون أمان.'] : /مشتريات|عقود|مناقص/.test(q) ? ['رتّب خطوات دورة المشتريات.', 'قارن عرضين باستخدام الجودة والتكلفة ومدة التوريد.', 'فرّق بين أمر الشراء والعقد والمناقصة.'] : /نقل|شحن/.test(q) ? ['قارن النقل الجوي والبحري والبري.', 'اختر وسيلة شحن لحالة عاجلة مع تبرير القرار.', 'راجع معاني مستندات الشحن في دليل المصطلحات.'] : /اعمال|اداري/.test(q) ? ['فرّق بين الكفاءة والفعالية.', 'طبّق وظائف الإدارة على مستودع.', 'راجع المدارس الإدارية والمهارات من بنك ملفك.'] : ['ارسم تدفقات المواد والمعلومات والمال.', 'اشرح العلاقة بين اللوجستيات وسلسلة الإمداد.', 'اربط تأخر المورد بتأثيره على المخزون والعميل.'];
    return sourceReply('educational', `أبشر، أقدر أقترح أسئلة محتملة للمراجعة داخل التخصص، لكن ما أعرف أسئلة اختبارك الفعلية ولا أضمن أنها تجي. هذي توقعات تعليمية، عدّلها حسب الأجزاء اللي حددها محاضرك:\n${topics.map((topic, index) => `${index + 1}. ${topic}`).join('\n')}\nإذا أضفت نص المحاضرات وحدود الاختبار في الملاحظات أقدر أرجع لك بما ورد فيها بدقة أكبر.`, [educationSource('practice-topics', 'أسئلة مقترحة للتدريب داخل التخصص')], [{ label: 'تدرّب من بنكك', page: 'practice' }, { label: 'أضف حدود الاختبار ومحاضراته', page: 'notes' }]);
  }
  if (/اذاكر|مذاكر|خطة|خطه|رتب دراستي|افهم الماده|احفظ|خطوه بخطوه/.test(q)) return sourceReply('guide', 'أبشر، خلّنا نمشي خطوة بخطوة:\n١. افتح موعد أقرب اختبار من المهام، ثم اختر موضوعاً صغيراً من محاضرتك.\n٢. اقرأ الفكرة ١٠ دقائق، واطلب مني شرح المصطلح أو المثال اللي وقف معك.\n٣. سكّر المذكرة واشرح الفكرة بصوتك ٥ دقائق.\n٤. اختبر نفسك من البنك أو المصطلحات، ثم راجع سبب الخطأ من المرجع.\n٥. سجّل نقطة تحتاج مراجعة، وارجع لها بكرة وبعد عدة أيام.\nخطوة اليوم تصنع غداً أجمل. خطة المذاكرة تحدد أوقاتك بحسب مواعيدك، وتقدر تعدلها حسب طاقتك.', [{ id: 'study-method', label: 'إرشاد تعليمي: الاسترجاع والمراجعة المتباعدة', kind: 'educational', page: 'plan' }], [{ label: 'خطة مذاكرتي بالأوقات', page: 'plan' }, { label: 'اختباراتي التجريبية', page: 'practice' }]);
  if (/^(هلا|هلا بك|سلام|السلام عليكم|اهلا|مرحبا|شكرا|يعطيك العافيه|من انت|وش اسمك|ساعدني)$/.test(q)) return sourceReply('guide', 'يا هلا، معك تيتشر لوجستيك. نراجع المخزون والمخازن، المشتريات والعقود، النقل والشحن، مبادئ الأعمال وسلاسل الإمداد. قل لي وش الفكرة اللي نبدأ فيها، أو اضغط «اختبرني».', [], [{ label: 'مواد تخصصي', page: 'courses' }]);
  if (/^(اختبرني|اسالني|سوال تجريبي|ابي تدريب|ابغي تدريب|تدريب)$/.test(q) || (/اختبرني|اسالني|تدريب/.test(q) && DOMAIN.test(q))) return sourceReply('guide', 'أبشر، اضغط «اختبرني من البنك» أو «اختبرني بالمصطلحات» تحت. بعطيك سؤالاً كل مرة، تكتب الإجابة أو تختارها، وبعد التصحيح ننتقل للي بعده. التصحيح من مفتاح الملف المرفق أو معاني الصورة.', [{ id: PRACTICE_BANK.id, label: PRACTICE_BANK.title, kind: 'bank', page: 'practice' }], [{ label: 'الاختبار التجريبي الكامل', page: 'practice' }]);
  const courseIds = new Set(relevantCourses(data).map(course => course.id));
  const queryTokens = tokens(trimmed);
  const notes = data.notes.filter(note => courseIds.has(note.courseId) && !INJECTION.test(norm(note.title))).map(note => ({ note, score: overlap(queryTokens, `${note.title} ${note.content}`) })).filter(row => row.score > 0).sort((a, b) => b.score - a.score);
  const top = notes[0];
  const specificLecture = /المحاضره|محاضره|الدكتور|الدكتوره|استاذ|السلايد|صفحه|الفصل (?:الاول|الثاني|الثالث|الرابع|الخامس)|لخص ملاحظ/.test(q);
  if (top && (DOMAIN.test(q) || specificLecture || top.score >= 2)) {
    const sentences = top.note.content.split(/(?<=[.!؟。])\s+|\n+/).map(sentence => sentence.trim()).filter(sentence => sentence && !INJECTION.test(norm(sentence)));
    const excerpts = sentences.map((sentence, index) => ({ sentence, index, score: overlap(queryTokens, sentence) })).filter(row => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.index - b.index).map(row => row.sentence.slice(0, 600));
    if (excerpts.length) return sourceReply('source', `أبشر، هذا من ملاحظتك «${top.note.title}» كما كتبته أنت:\n${excerpts.map(sentence => `«${sentence}»`).join('\n')}\nاقرأ الفكرة، ثم غطّ النص وحاول تشرحها بطريقتك. هذا اقتباس من بياناتك، مو تأكيد أن الملاحظة مطابقة للمحاضرة الرسمية.`, [{ id: top.note.id, label: `ملاحظتك: ${top.note.title}`, kind: 'note', page: 'notes', excerpt: excerpts.join('\n') }], [{ label: 'راجع النص في الملاحظات', page: 'notes' }]);
  }
  if (specificLecture) return sourceReply('missing', 'أبشر، أقدر أساعدك، لكن نص هالمحاضرة أو السلايد مو موجود عندي بشكل يجاوب سؤالك. أضف المحتوى في الملاحظات واربطه بالمادة، وبعدها أستخرج لك الجمل المتعلقة بسؤالك. أقدر الآن أعطيك شرحاً تعليمياً عاماً إذا كتبت اسم المفهوم، مع تمييزه عن كلام محاضرك.', [{ id: 'lecture-availability', label: 'لا يوجد نص محاضرة مطابق في الملاحظات المرتبطة بموادك', kind: 'availability', page: 'notes' }], [{ label: 'أضف نص المحاضرة', page: 'notes' }]);
  if (/كود سعودي|الكود السعودي|نظام سعودي|انظمه السعوديه|ماده نظاميه|لائحه سعوديه/.test(q)) return sourceReply('missing', 'أبشر، أشرح لك النص السعودي المرتبط باللوجستيات إذا أضفته في الملاحظات مع الجهة وتاريخ الإصدار. ما عندي نسخة موثقة وحديثة لكل الأنظمة، وما راح أخمّن رقم مادة أو اشتراط. إذا قصدك اللهجة، شرحي معك باللهجة السعودية المبسطة.', [{ id: 'legal-availability', label: 'الأنظمة والاشتراطات: تحتاج نصاً رسمياً محدداً', kind: 'availability', page: 'notes' }], [{ label: 'أضف النص الرسمي للمراجعة', page: 'notes' }]);
  const bankMatch = PRACTICE_QUESTIONS.find(question => norm(question.q) === q || (norm(question.q).length > 20 && q.includes(norm(question.q))));
  if (bankMatch) {
    const expected = bankMatch.options.find(option => option.letter === bankMatch.answer)!;
    return sourceReply('source', `أبشر، هذا سؤال موجود في بنكك المرفق. حسب مفتاح الملف، الإجابة ${expected.letter}: ${expected.text}.\nالتصحيح بمفتاح المرفق؛ ما أعتبره إثباتاً مستقلاً على صحة المفتاح أو جواباً رسمياً لاختبار الجامعة.`, [{ id: bankMatch.id, label: `بنك ملفك · سؤال ${bankMatch.id} · مفتاح الإجابة المرفق`, kind: 'bank', page: 'practice', excerpt: expected.text }], [{ label: 'تدرّب من الملف الأصلي', page: 'practice' }]);
  }
  if (term) return sourceReply('source', `أبشر، ${term.abbreviation} اختصار ${term.english}، ومعناه: ${term.arabic}.${term.note ? `\n${term.note}` : ''}\nهذا المعنى من صورتك في دليل المصطلحات. تبي تثبته؟ غطّ المعنى وحاول تسترجعه، ثم راجع البطاقة.`, [{ id: term.id, label: `صورتك · مصطلح ${term.abbreviation}`, kind: 'term', page: 'logistics', excerpt: `${term.english}: ${term.arabic}` }], [{ label: 'بطاقات ومعاني المصطلحات', page: 'logistics' }]);
  if (!DOMAIN.test(q)) return sourceReply('refusal', TEACHER_REFUSAL);
  const lesson = TEACHER_LESSONS.find(item => item.match.test(q));
  if (lesson) return sourceReply('educational', `أبشر، خلّنا نفكها بمثال بسيط.\n${lesson.content}\n\n${lesson.check}\nهذا شرح تعليمي واستنتاج داخل التخصص؛ قارنه بمحاضرتك، وما أنسبه لأستاذك أو لاختبارك.`, [educationSource(lesson.id, lesson.title)], [{ label: 'أضف ملاحظتك للمقارنة', page: 'notes' }, { label: 'راجع المصطلحات', page: 'logistics' }]);
  return sourceReply('missing', 'سؤالك داخل اللوجستيات، لكن ما عندي نص أو شرح محلي كافٍ له الآن. اكتب اسم المفهوم بتحديد أكثر أو أضف المقطع من محاضرتك في الملاحظات؛ أفضّل أوضح النقص على أن أعطيك إجابة مختلقة.', [{ id: 'topic-availability', label: 'لا يوجد مرجع محلي مطابق', kind: 'availability', page: 'notes' }], [{ label: 'أضف المقطع من المنهج', page: 'notes' }]);
}

export function createTeacherQuiz(mode: 'bank' | 'terms' = 'bank', seed = 1, count = 5): TeacherQuizQuestion[] {
  if (!Number.isFinite(count) || count < 1) return [];
  if (mode === 'bank') return shuffleTerms(PRACTICE_QUESTIONS, seed).slice(0, Math.min(40, Math.floor(count))).map(question => ({ id: `bank-${question.id}`, question: question.q, options: question.options.map(option => ({ key: option.letter, text: option.text })), answer: question.answer, source: { id: question.id, label: `بنك ملفك · سؤال ${question.id} · التصحيح بمفتاح المرفق`, kind: 'bank', page: 'practice' } }));
  return shuffleTerms(LOGISTICS_TERMS, seed).slice(0, Math.min(LOGISTICS_TERMS.length, Math.floor(count))).map((term, index) => {
    const meanings = shuffleTerms([...new Set(LOGISTICS_TERMS.map(item => item.arabic))].filter(meaning => meaning !== term.arabic), seed + index + 11).slice(0, 3);
    const options = shuffleTerms([term.arabic, ...meanings], seed + index + 31).map((text, option) => ({ key: ['أ', 'ب', 'ج', 'د'][option], text }));
    return { id: `term-${term.id}`, question: `وش معنى ${term.abbreviation} (${term.english})؟`, options, answer: options.find(option => option.text === term.arabic)!.key, source: { id: term.id, label: `صورتك · المصطلح ${term.abbreviation}`, kind: 'term', page: 'logistics' } };
  });
}
export function gradeTeacherAnswer(question: TeacherQuizQuestion, answer: string) {
  const value = norm(answer).replace(/^(?:الاجابه|الجواب|اختار)\s+/u, '').trim();
  const aliases: Record<string, string> = { الف: 'ا', باء: 'ب', جيم: 'ج', دال: 'د', '1': 'ا', '2': 'ب', '3': 'ج', '4': 'د', '١': 'ا', '٢': 'ب', '٣': 'ج', '٤': 'د' };
  const normalized = aliases[value] ?? value;
  const selected = question.options.find(option => norm(option.key) === normalized || norm(option.text) === normalized);
  const correct = !!selected && selected.key === question.answer;
  const expected = question.options.find(option => option.key === question.answer);
  return { accepted: !!selected, correct, selectedKey: selected?.key, answer: expected?.text ?? '', feedback: !selected ? 'اكتب حرف الخيار أو نصه كما هو، أو اضغط على الإجابة.' : correct ? `صح عليك. الإجابة ${expected?.key}: ${expected?.text}.` : `محاولة طيبة، نراجعها سوا. حسب المرجع، الإجابة ${expected?.key}: ${expected?.text}.`, source: question.source };
}

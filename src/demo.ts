import type { AppData } from './types';
import { emptyData } from './store';
import { addDays, todayISO } from './logic';

export function demoData(): AppData {
  const today = todayISO();
  const data = emptyData();
  data.demo = true;
  data.settings = { ...data.settings, name: 'طالب', monthlyBudget: 1500, dailyMinutes: 120 };
  data.courses = [
    { id: 'course-1', name: 'مبادئ البرمجة', color: '#6b4fe0' },
    { id: 'course-2', name: 'الرياضيات', color: '#2a9b8f' },
    { id: 'course-3', name: 'اللغة الإنجليزية', color: '#e99854' },
  ];
  const day = new Date(today + 'T12:00:00').getDay();
  data.lectures = [
    { id: 'lecture-1', courseId: 'course-1', day, start: '09:00', end: '10:30', location: 'قاعة ٢١٠' },
    { id: 'lecture-2', courseId: 'course-2', day, start: '11:00', end: '12:00', location: 'قاعة ١٠٥' },
    { id: 'lecture-3', courseId: 'course-3', day: (day + 2) % 7, start: '10:00', end: '11:30', location: 'قاعة ٣٠١' },
  ];
  data.tasks = [
    { id: 'task-1', title: 'مراجعة الفصل الأول', courseId: 'course-1', kind: 'exam', due: addDays(today, 4), priority: 'high', minutes: 240, completed: false },
    { id: 'task-2', title: 'حل ورقة التمارين', courseId: 'course-2', kind: 'assignment', due: addDays(today, 2), priority: 'high', minutes: 90, completed: false },
    { id: 'task-3', title: 'مشروع آلة حاسبة', courseId: 'course-1', kind: 'project', due: addDays(today, 9), priority: 'medium', minutes: 300, completed: false },
    { id: 'task-4', title: 'قراءة الوحدة الثانية', courseId: 'course-3', kind: 'assignment', due: addDays(today, 5), priority: 'medium', minutes: 60, completed: false },
    { id: 'task-5', title: 'ترتيب ملاحظات الأسبوع', courseId: '', kind: 'assignment', due: today, priority: 'low', minutes: 30, completed: true },
  ];
  data.notes = [{ id: 'note-1', title: 'المتغيرات وأنواع البيانات', courseId: 'course-1', content: 'المتغير مساحة في الذاكرة نخزن فيها قيمة يمكن تغييرها أثناء تنفيذ البرنامج. يساعد اسم المتغير الواضح في فهم الغرض منه. تشمل أنواع البيانات الشائعة الأعداد والنصوص والقيم المنطقية. نختار نوع البيانات بحسب طبيعة القيمة والعمليات المطلوبة. يجب تهيئة المتغير قبل استخدامه لتجنب النتائج غير المتوقعة.', summary: '• المتغير مساحة في الذاكرة نخزن فيها قيمة يمكن تغييرها أثناء تنفيذ البرنامج.\n• تشمل أنواع البيانات الشائعة الأعداد والنصوص والقيم المنطقية.\n• يجب تهيئة المتغير قبل استخدامه لتجنب النتائج غير المتوقعة.', updatedAt: new Date().toISOString() }];
  data.transactions = [
    { id: 'transaction-1', title: 'المكافأة الجامعية', kind: 'income', amount: 1000, category: 'مكافأة', date: today },
    { id: 'transaction-2', title: 'كتب ومستلزمات', kind: 'expense', amount: 180, category: 'دراسة', date: today },
    { id: 'transaction-3', title: 'وجبة في الجامعة', kind: 'expense', amount: 35, category: 'طعام', date: today },
    { id: 'transaction-4', title: 'المواصلات', kind: 'expense', amount: 120, category: 'مواصلات', date: today },
  ];
  return data;
}

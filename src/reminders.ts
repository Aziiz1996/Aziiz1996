import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Settings } from './types';
import type { AppData } from './types';
import { academicAlerts } from './academicAlerts';

export async function disableAcademicReminders() {
  if (Capacitor.isNativePlatform()) await LocalNotifications.cancel({ notifications:Array.from({length:56},(_,i)=>({id:7000+i})) });
}

export async function enableAcademicReminders(data:AppData):Promise<string> {
  if (!Capacitor.isNativePlatform()) return 'في المتصفح استخدم تنزيل التقويم لاستيراد المواعيد والتنبيهات. إشعارات التطبيق تحتاج نسخة الهاتف.';
  const permission=await LocalNotifications.requestPermissions();
  if(permission.display!=='granted') return 'فعّل إذن التنبيهات من إعدادات الجهاز.';
  const alerts=academicAlerts(data);
  await disableAcademicReminders();
  if(alerts.length) await LocalNotifications.schedule({notifications:alerts.map((e,i)=>({id:7000+i,title:e.title,body:e.minutes===60?'موعد المحاضرة بعد ساعة':e.minutes===1440?'الموعد غدًا في هذا الوقت':'الموعد بعد ساعتين',schedule:{at:new Date(e.at)}}))});
  return `تم تفعيل ${alerts.length} تنبيهًا قادمًا. أعد التفعيل بعد تحديث الجداول. المواعيد غير محددة الوقت لا يُنشأ لها تنبيه.`;
}

export async function enableStudyReminders(settings: Settings): Promise<string> {
  if (!Capacitor.isNativePlatform()) return 'التذكيرات متاحة في نسخة الآيفون بعد تثبيتها.';
  if (!settings.studyDays.length) return 'اختر أيام المذاكرة واحفظ إعداداتك أولاً.';
  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') return 'لم تسمح بالإشعارات. يمكنك تفعيلها من إعدادات الآيفون.';
  const [hour, minute] = settings.studyStart.split(':').map(Number);
  const ids = Array.from({ length: 7 }, (_, day) => ({ id: 6100 + day }));
  await LocalNotifications.cancel({ notifications: ids });
  await LocalNotifications.schedule({ notifications: settings.studyDays.map(day => ({
    id: 6100 + day,
    title: 'عز اللوجستيات • وقت المذاكرة',
    body: 'راجع خطة اليوم وابدأ أول جلسة مذاكرة.',
    schedule: { on: { weekday: day + 1, hour, minute }, repeats: true },
  })) });
  return 'فُعّلت تذكيرات المذاكرة حسب الأيام والوقت المحفوظين. أعد تفعيلها بعد تغيير الموعد.';
}

export async function disableStudyReminders(): Promise<string> {
  if (!Capacitor.isNativePlatform()) return 'التذكيرات متاحة في نسخة الآيفون فقط.';
  await LocalNotifications.cancel({ notifications: Array.from({ length: 7 }, (_, day) => ({ id: 6100 + day })) });
  return 'أُوقفت تذكيرات المذاكرة.';
}

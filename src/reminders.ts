import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Settings } from './types';

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
    title: 'عزيز ليدر • وقت المذاكرة',
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

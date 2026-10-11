import { Capacitor } from '@capacitor/core';
import { CapacitorCalendar } from '@ebarooni/capacitor-calendar';
import type { AppData } from './types';

const STORE_KEY = 'az-logistics-native-calendar-v1';
const localStamp = (date: string, time: string) => new Date(`${date}T${time || '09:00'}:00`).getTime();
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export interface CalendarSyncResult { created: number; updated: number; }

export async function syncNativeCalendar(data: AppData): Promise<CalendarSyncResult> {
  if (!Capacitor.isNativePlatform()) throw new Error('WEB_CALENDAR');
  const permission = await CapacitorCalendar.requestWriteOnlyCalendarAccess();
  if (permission.result !== 'granted') throw new Error('CALENDAR_DENIED');
  let stored: Record<string, string> = {};
  try { stored = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { stored = {}; }
  const events: Array<{ key:string; title:string; start:number; end:number; description:string; location?:string; url?:string; alerts:number[] }> = [];
  for (const event of data.universityEvents ?? []) {
    const start = localStamp(event.date, event.time || '09:00');
    events.push({ key:event.id, title:event.title, start, end:localStamp(event.endDate || event.date, event.endTime || (event.time ? event.time : '10:00')), description:event.description || 'موعد جامعي من عز اللوجستيات', url:event.url, alerts:event.kind === 'lecture' ? [-60] : [-1440, -120] });
  }
  for (const task of data.tasks.filter(item => !item.completed)) {
    const start = localStamp(task.due, task.time || '09:00');
    events.push({ key:`task-${task.id}`, title:task.title, start, end:localStamp(task.due, task.endTime || '10:00'), description:task.kind === 'exam' ? 'اختبار — عز اللوجستيات' : 'واجب أو مهمة — عز اللوجستيات', alerts:[-1440, -120] });
  }
  const today = new Date();
  for (let offset = 0; offset < 56; offset++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const key = dateKey(date);
    for (const lecture of data.lectures.filter(item => item.day === date.getDay() && item.start)) {
      const title = data.courses.find(item => item.id === lecture.courseId)?.name || 'محاضرة';
      events.push({ key:`lecture-${lecture.id}-${key}`, title, start:localStamp(key, lecture.start), end:localStamp(key, lecture.end || lecture.start), description:'محاضرة أسبوعية — عز اللوجستيات', location:lecture.location, alerts:[-60] });
    }
  }
  let created = 0; let updated = 0;
  for (const event of events) {
    if (!Number.isFinite(event.start) || !Number.isFinite(event.end)) continue;
    const options = { title:event.title, startDate:event.start, endDate:Math.max(event.end, event.start + 3600000), description:event.description, location:event.location, url:event.url, alerts:event.alerts };
    const nativeId = stored[event.key];
    if (nativeId) {
      try { await CapacitorCalendar.modifyEvent({ id:nativeId, ...options }); updated++; continue; }
      catch { delete stored[event.key]; }
    }
    const result = await CapacitorCalendar.createEvent(options);
    if (result.id != null) stored[event.key] = String(result.id);
    created++;
  }
  localStorage.setItem(STORE_KEY, JSON.stringify(stored));
  return { created, updated };
}

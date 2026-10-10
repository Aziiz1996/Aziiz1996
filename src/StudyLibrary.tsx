import { useEffect, useState } from 'react';
import { useApp } from './store';

interface Lesson { id: string; title: string; content: string; summary: string; sourceUrl: string; }
export default function StudyLibrary() {
  const { update, notify } = useApp();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('./personal-lessons/index.json', { signal: controller.signal }).then(async response => {
      if (response.ok) { const value = await response.json(); if (Array.isArray(value.lessons)) setLessons(value.lessons); }
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!lessons.length) return null;
  function add() {
    update(d => {
      const courseId = d.courses.find(c => c.name === 'إدارة المخزون والمخازن')?.id ?? 'inventory-course-103';
      if (!d.courses.some(c => c.id === courseId)) d.courses.push({ id: courseId, name: 'إدارة المخزون والمخازن', color: '#7567dd' });
      for (const lesson of lessons) if (!d.notes.some(n => n.id === lesson.id)) d.notes.push({ id: lesson.id, title: lesson.title, courseId, content: lesson.content, summary: lesson.summary, updatedAt: new Date().toISOString() });
    });
    notify('أُضيفت المحاضرات إلى ملاحظاتك. الملاحظات الموجودة بقيت محفوظة.');
  }
  return <section className="card stack"><h2>محاضراتك الخمس: إدارة المخزون والمخازن</h2><p>ملخصات جاهزة للمراجعة، مع ملفاتك الأصلية. أرقام الصفحات تشير إلى ترتيب الصفحات داخل كل ملف.</p><button className="btn btn-primary" onClick={add}>إضافة المحاضرات الخمس إلى ملاحظاتي</button>{lessons.map(lesson => <details key={lesson.id}><summary>{lesson.title}</summary><p className="preserve-lines">{lesson.summary}</p><a href={lesson.sourceUrl} target="_blank" rel="noopener noreferrer">فتح ملف المحاضرة الأصلي</a></details>)}</section>;
}

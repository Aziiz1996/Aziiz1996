import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAcademicSummary } from '../server/openai.mjs';

test('structured academic JSON is normalized and rendered as Arabic Markdown', () => {
  const result = normalizeAcademicSummary({ title:' إدارة المخزون ', introduction:'مقدمة أكاديمية تشرح إدارة المخزون وأثرها في استمرارية العمليات وتقليل التكلفة وتحسين مستوى الخدمة.', objectives:['فهم المخزون', 'حساب نقطة إعادة الطلب'], topics:[{ title:'التخطيط', points:['التنبؤ بالطلب', 'تحديد الكميات'] }], concepts:[{ term:'مخزون الأمان', definition:'كمية احتياطية لمواجهة عدم اليقين.' }], reviewQuestions:['كيف تُحسب نقطة إعادة الطلب؟'] }, 'بديل');
  assert.equal(result.title, 'إدارة المخزون');
  assert.deepEqual(result.objectives, ['فهم المخزون', 'حساب نقطة إعادة الطلب']);
  assert.deepEqual(result.concepts[0], { term:'مخزون الأمان', definition:'كمية احتياطية لمواجهة عدم اليقين.' });
  assert.match(result.markdown, /## مقدمة/); assert.match(result.markdown, /## أهداف المادة/); assert.match(result.markdown, /## الموضوعات الرئيسية/); assert.match(result.markdown, /## مفاهيم مهمة/);
});

test('incomplete AI JSON is rejected before database storage', () => {
  assert.throws(() => normalizeAcademicSummary({ title:'ملخص', introduction:'قصير' }, 'بديل'), /invalid-ai-output/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAcademicSummary } from '../server/openai.mjs';

test('academic summary output is normalized and bounded', () => {
  const result = normalizeAcademicSummary({ title:' إدارة المخزون ', markdown:'# مقدمة\n' + 'محتوى أكاديمي منظم. '.repeat(8), concepts:['ABC', '  ', 'نقطة إعادة الطلب'] }, 'بديل');
  assert.equal(result.title, 'إدارة المخزون');
  assert.deepEqual(result.concepts, ['ABC', 'نقطة إعادة الطلب']);
  assert.match(result.markdown, /^# مقدمة/);
});

test('empty AI output is rejected before database storage', () => {
  assert.throws(() => normalizeAcademicSummary({ title:'', markdown:'قصير' }, 'بديل'), /invalid-ai-output/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { LOGISTICS_CATEGORIES, LOGISTICS_TERMS, createTermQuiz, gradeQuiz, normalizeLogisticsSearch, searchTerms, shuffleTerms } from '../src/logisticsTerms.ts';

test('the image dictionary preserves all 50 unique abbreviations and both lading variants', () => {
  assert.equal(LOGISTICS_TERMS.length, 50);
  assert.equal(new Set(LOGISTICS_TERMS.map(term => term.id)).size, 50);
  assert.equal(new Set(LOGISTICS_TERMS.map(term => term.abbreviation)).size, 50);
  assert.ok(LOGISTICS_TERMS.every(term => term.english.trim() && term.arabic.trim() && LOGISTICS_CATEGORIES.some(category => category.id === term.category)));
  assert.equal(LOGISTICS_TERMS.find(term => term.id === 'BOL')?.english, 'Bill of Lading');
  assert.equal(LOGISTICS_TERMS.find(term => term.id === 'BL')?.english, 'Bill of Lading (Sea)');
  assert.equal(LOGISTICS_TERMS.find(term => term.id === 'BOL')?.arabic, 'سند الشحن');
  assert.equal(LOGISTICS_TERMS.find(term => term.id === 'BL')?.arabic, 'سند الشحن البحري');
});

test('GDP retains the image distribution context and DDU identifies its historical status', () => {
  const gdp = LOGISTICS_TERMS.find(term => term.id === 'GDP');
  assert.equal(gdp?.english, 'Good Distribution Practice');
  assert.equal(gdp?.arabic, 'ممارسات التوزيع الجيد');
  assert.match(gdp?.note ?? '', /السياق اللوجستي/);
  const ddu = LOGISTICS_TERMS.find(term => term.id === 'DDU');
  assert.equal(ddu?.english, 'Delivered Duty Unpaid');
  assert.match(ddu?.note ?? '', /تاريخي/);
  assert.match(ddu?.note ?? '', /2020/);
});

test('search handles Arabic diacritics and letter variants, English case, and abbreviations', () => {
  assert.equal(normalizeLogisticsSearch('إِدَارَة سِلْسِلَة الإِمْدَاد'), 'اداره سلسله الامداد');
  assert.deepEqual(searchTerms('إِدَارَة سِلْسِلَة الإِمْدَاد').map(term => term.id), ['SCM']);
  assert.deepEqual(searchTerms('اداره المستودعات').map(term => term.id), ['WMS']);
  assert.deepEqual(searchTerms('  cubic METER ').map(term => term.id), ['CBM']);
  assert.deepEqual(searchTerms('wms').map(term => term.id), ['WMS']);
  assert.ok(searchTerms('C/O').some(term => term.id === 'C/O'));
  assert.deepEqual(searchTerms('إشعار الشحن المُسبق').map(term => term.id), ['ASN']);
  assert.equal(searchTerms('عبارة غير موجودة').length, 0);
});

test('category filters and multiword search compose without modifying the dictionary', () => {
  const original = JSON.stringify(LOGISTICS_TERMS);
  assert.equal(searchTerms('').length, 50);
  for (const category of LOGISTICS_CATEGORIES) {
    const results = searchTerms('', category.id);
    assert.ok(results.length > 0);
    assert.ok(results.every(term => term.category === category.id));
  }
  assert.deepEqual(searchTerms('المستودعات', 'shipping'), []);
  assert.deepEqual(searchTerms('المستودعات', 'warehousing').map(term => term.id), ['WMS']);
  assert.deepEqual(searchTerms('Full Load', 'shipping').map(term => term.id), ['FCL', 'FTL']);
  assert.equal(JSON.stringify(LOGISTICS_TERMS), original);
});

test('ten-question practice is deterministic with unique questions and authentic choices', () => {
  const quiz = createTermQuiz(LOGISTICS_TERMS, 10, 71);
  assert.equal(quiz.length, 10);
  assert.equal(new Set(quiz.map(question => question.termId)).size, 10);
  assert.deepEqual(quiz, createTermQuiz(LOGISTICS_TERMS, 10, 71));
  assert.notDeepEqual(quiz, createTermQuiz(LOGISTICS_TERMS, 10, 72));
  const authenticMeanings = new Set(LOGISTICS_TERMS.map(term => term.arabic));
  for (const question of quiz) {
    const term = LOGISTICS_TERMS.find(item => item.id === question.termId)!;
    assert.equal(question.english, term.english);
    assert.equal(question.correctAnswer, term.arabic);
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.equal(question.options.filter(option => option === term.arabic).length, 1);
    assert.ok(question.options.every(option => authenticMeanings.has(option)));
  }
});

test('grading returns the precise score, chosen answers, and correct review meanings', () => {
  const quiz = createTermQuiz(LOGISTICS_TERMS, 10, 12);
  const answers = Object.fromEntries(quiz.map((question, index) => [question.id, index < 7 ? question.correctAnswer : question.options.find(option => option !== question.correctAnswer)!]));
  const snapshot = JSON.stringify({ quiz, answers });
  const grade = gradeQuiz(quiz, answers);
  assert.equal(grade.score, 7); assert.equal(grade.total, 10); assert.equal(grade.answered, 10);
  assert.equal(grade.review.filter(row => !row.correct).length, 3);
  assert.ok(grade.review.every(row => row.answer === answers[row.question.id]));
  assert.equal(gradeQuiz(quiz, {}).score, 0);
  assert.equal(gradeQuiz(quiz, {}).answered, 0);
  assert.equal(JSON.stringify({ quiz, answers }), snapshot);
});

test('small or empty sources never introduce invented answers or duplicate choices', () => {
  assert.deepEqual(createTermQuiz([]), []);
  assert.deepEqual(createTermQuiz(LOGISTICS_TERMS.slice(0, 1)), []);
  assert.deepEqual(createTermQuiz(LOGISTICS_TERMS, 0), []);
  assert.deepEqual(createTermQuiz(LOGISTICS_TERMS, Infinity), []);
  const pair = LOGISTICS_TERMS.slice(0, 2);
  const quiz = createTermQuiz([...pair, pair[0]], 10, 6);
  assert.equal(quiz.length, 2);
  assert.ok(quiz.every(question => question.options.length === 2 && new Set(question.options).size === 2));
  const snapshot = JSON.stringify(pair);
  assert.deepEqual(shuffleTerms(pair, 5), shuffleTerms(pair, 5));
  assert.equal(JSON.stringify(pair), snapshot);
});

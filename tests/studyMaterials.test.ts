import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, validateData } from '../src/validation.ts';
import { gradeImportedQuiz, mergeStudyMaterials, parseMaterialBundle, type MaterialBundle } from '../src/studyMaterials.ts';

const quiz={id:'quiz-1',title:'Synthetic',questions:[{id:'one',question:'First?',options:['A','B'],correct:1},{id:'two',question:'Second?',options:['A','B'],correct:0}]};
const bundle:MaterialBundle={format:'az-logistics-materials-v1',summaries:[{id:'summary-1',title:'Synthetic',courseName:'إدارة المخزون والمخازن',content:'A | B\nOne | Two'}],quizzes:[quiz]};
test('materials import uses the enrolled course and preserves personal changes on repeated imports',()=>{
 const data=emptyData();data.courses=[{id:'inventory-management',name:'إدارة المخزون والمخازن',color:'#123456'},{id:'moodle-course-7',name:'إدارة المخزون والمخازن - 103 دار',color:'#123456'}];data.settings.monthlyBudget=1234;
 const original=JSON.stringify(data);const first=mergeStudyMaterials(data,bundle);
 assert.equal(JSON.stringify(data),original);assert.equal(first.data.notes[0].courseId,'moodle-course-7');assert.equal(first.data.settings.monthlyBudget,1234);assert.equal(first.quizzes,1);assert.ok(validateData(first.data));
 first.data.notes[0].content='Private user edit';const second=mergeStudyMaterials(first.data,bundle);
 assert.equal(second.data.notes[0].content,'Private user edit');assert.equal(second.data.notes.length,1);assert.equal(second.data.quizzes?.length,1);assert.equal(second.skipped,2);
});
test('invalid answer keys are rejected by import and persisted account validation',()=>{
 const invalid=structuredClone(bundle);invalid.quizzes[0].questions[0].correct=9;
 assert.throws(()=>parseMaterialBundle(JSON.stringify(invalid)));assert.throws(()=>mergeStudyMaterials(emptyData(),invalid));
 const data=emptyData();data.quizzes=invalid.quizzes;assert.equal(validateData(data),false);
 assert.throws(()=>parseMaterialBundle('not json'));
});
test('grading ignores forged answer keys and reports skipped questions correctly',()=>{
 assert.deepEqual(gradeImportedQuiz(quiz,{one:1,forged:0}),{correct:1,total:2,unanswered:1,wrong:0,percent:50});
 assert.deepEqual(gradeImportedQuiz(quiz,{one:0,two:0}),{correct:1,total:2,unanswered:0,wrong:1,percent:50});
 assert.equal(gradeImportedQuiz(quiz,{one:1,two:0}).percent,100);
});

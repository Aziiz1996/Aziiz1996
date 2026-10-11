const clean = value => String(value || '').replace(/\u0000/g, '').trim();
const list = (value, max, length = 400) => Array.isArray(value) ? value.map(item => clean(item).slice(0, length)).filter(Boolean).slice(0, max) : [];

export function normalizeAcademicSummary(value, fallbackTitle) {
  if (!value || typeof value !== 'object') throw new Error('invalid-ai-output');
  const title = clean(value.title || fallbackTitle).slice(0, 180);
  const introduction = clean(value.introduction).slice(0, 8000);
  const objectives = list(value.objectives, 20);
  const topics = Array.isArray(value.topics) ? value.topics.flatMap(topic => {
    if (!topic || typeof topic !== 'object') return [];
    const topicTitle = clean(topic.title).slice(0, 240);
    const points = list(topic.points, 20, 1000);
    return topicTitle && points.length ? [{ title:topicTitle, points }] : [];
  }).slice(0, 30) : [];
  const concepts = Array.isArray(value.concepts) ? value.concepts.flatMap(concept => {
    if (!concept || typeof concept !== 'object') return [];
    const term = clean(concept.term).slice(0, 200);
    const definition = clean(concept.definition).slice(0, 1200);
    return term && definition ? [{ term, definition }] : [];
  }).slice(0, 40) : [];
  const reviewQuestions = list(value.reviewQuestions, 20, 600);
  if (!title || introduction.length < 40 || !objectives.length || !topics.length || !concepts.length) throw new Error('invalid-ai-output');
  const markdown = [
    `# ${title}`,
    `## مقدمة\n${introduction}`,
    `## أهداف المادة\n${objectives.map(item => `- ${item}`).join('\n')}`,
    `## الموضوعات الرئيسية\n${topics.map(topic => `### ${topic.title}\n${topic.points.map(point => `- ${point}`).join('\n')}`).join('\n\n')}`,
    `## مفاهيم مهمة\n${concepts.map(item => `- **${item.term}:** ${item.definition}`).join('\n')}`,
    reviewQuestions.length ? `## أسئلة للمراجعة\n${reviewQuestions.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  return { title, introduction, objectives, topics, concepts, reviewQuestions, markdown };
}

const academicSummarySchema = {
  name:'academic_summary', strict:true,
  schema:{ type:'object', additionalProperties:false, required:['title','introduction','objectives','topics','concepts','reviewQuestions'], properties:{
    title:{ type:'string' }, introduction:{ type:'string' }, objectives:{ type:'array', items:{ type:'string' } },
    topics:{ type:'array', items:{ type:'object', additionalProperties:false, required:['title','points'], properties:{ title:{ type:'string' }, points:{ type:'array', items:{ type:'string' } } } } },
    concepts:{ type:'array', items:{ type:'object', additionalProperties:false, required:['term','definition'], properties:{ term:{ type:'string' }, definition:{ type:'string' } } } },
    reviewQuestions:{ type:'array', items:{ type:'string' } },
  } },
};

export async function generateAcademicSummary({ name, code, syllabus }) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 45000);
  const source = syllabus ? `المحتوى المرجعي المقدم من الطالب:\n${syllabus}` : 'لم يُقدَّم محتوى مرجعي. أنشئ نظرة دراسية عامة، واذكر بوضوح أنها عامة وقد تختلف عن توصيف الجامعة.';
  const prompt = `اسم المادة: ${name}\nرمز المادة: ${code || 'غير متوفر'}\n${source}\n\nأنشئ ملخصاً أكاديمياً عربياً لطالب دبلوم الخدمات اللوجستية. التزم بالمصدر عند توفره، ولا تخترع متطلبات أو مواعيد أو مراجع. قسّم النتيجة إلى مقدمة وأهداف وموضوعات ومفاهيم وأسئلة مراجعة.`;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', signal:controller.signal, headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json' }, body:JSON.stringify({ model:process.env.OPENAI_SUMMARY_MODEL || 'gpt-4.1-mini', temperature:0.2, response_format:{ type:'json_schema', json_schema:academicSummarySchema }, messages:[{ role:'system', content:'أنت مساعد أكاديمي دقيق. أعد البيانات العربية وفق مخطط JSON المطلوب فقط.' }, { role:'user', content:prompt }] }) });
    if (!response.ok) throw new Error('openai-http');
    const result = await response.json(); const content = result?.choices?.[0]?.message?.content;
    return normalizeAcademicSummary(JSON.parse(content), `ملخص ${name}`);
  } finally { clearTimeout(timer); }
}

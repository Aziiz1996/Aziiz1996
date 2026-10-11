const clean = value => String(value || '').replace(/\u0000/g, '').trim();

export function normalizeAcademicSummary(value, fallbackTitle) {
  if (!value || typeof value !== 'object') throw new Error('invalid-ai-output');
  const title = clean(value.title || fallbackTitle).slice(0, 180);
  const markdown = clean(value.markdown).slice(0, 100000);
  const concepts = Array.isArray(value.concepts) ? value.concepts.map(item => clean(item).slice(0, 200)).filter(Boolean).slice(0, 30) : [];
  if (!title || markdown.length < 80) throw new Error('invalid-ai-output');
  return { title, markdown, concepts };
}

export async function generateAcademicSummary({ name, code, syllabus }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  const source = syllabus ? `المحتوى المرجعي المقدم من الطالب:\n${syllabus}` : 'لم يُقدَّم محتوى مرجعي. أنشئ نظرة دراسية عامة، واذكر بوضوح أنها عامة وقد تختلف عن توصيف الجامعة.';
  const prompt = `اسم المادة: ${name}\nرمز المادة: ${code || 'غير متوفر'}\n${source}\n\nاكتب ملخصاً أكاديمياً عربياً منظماً يساعد طالب دبلوم الخدمات اللوجستية. التزم فقط بالمحتوى المقدم عندما يتوفر، ولا تخترع متطلبات أو مواعيد. استخدم عناوين Markdown ونقاطاً ومفاهيم أساسية وأسئلة مراجعة قصيرة.`;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST', signal:controller.signal,
      headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ model:process.env.OPENAI_SUMMARY_MODEL || 'gpt-4.1-mini', temperature:0.2, response_format:{ type:'json_object' }, messages:[
        { role:'system', content:'أنت مساعد أكاديمي دقيق. أعد JSON فقط بالمفاتيح title وmarkdown وconcepts، وconcepts مصفوفة نصوص.' },
        { role:'user', content:prompt },
      ] }),
    });
    if (!response.ok) throw new Error('openai-http');
    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    return normalizeAcademicSummary(JSON.parse(content), `ملخص ${name}`);
  } finally { clearTimeout(timer); }
}

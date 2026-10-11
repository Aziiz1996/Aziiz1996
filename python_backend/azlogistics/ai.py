import json
import httpx
from .config import settings
from .models import AcademicAssessment, QuizBank

async def structured_completion(system: str, user: str, schema_name: str, schema: dict) -> dict:
    cfg = settings()
    payload = {"model": cfg.openai_model, "temperature": 0.15, "response_format": {"type": "json_schema", "json_schema": {"name": schema_name, "strict": True, "schema": schema}}, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post("https://api.openai.com/v1/chat/completions", headers={"Authorization": f"Bearer {cfg.openai_api_key}"}, json=payload)
        response.raise_for_status()
    return json.loads(response.json()["choices"][0]["message"]["content"])

async def assess_document(title: str, text: str) -> AcademicAssessment:
    raw = await structured_completion("أنت مراجع أكاديمي متخصص في سلاسل الإمداد. قيّم المصدر فقط من النص المقدم.", f"العنوان: {title}\n\nعينة المحتوى:\n{text[:30000]}\n\nقيّم الصلة والسلامة الأكاديمية والوضوح وملاءمته لطالب دبلوم.", "academic_assessment", AcademicAssessment.model_json_schema())
    return AcademicAssessment.model_validate(raw)

async def make_quiz(title: str, text: str, count: int) -> QuizBank:
    schema = QuizBank.model_json_schema()
    schema["properties"]["questions"]["minItems"] = count
    schema["properties"]["questions"]["maxItems"] = count
    raw = await structured_completion("أنت مصمم اختبارات أكاديمية. استخدم المصدر فقط، واجعل لكل سؤال إجابة واحدة صحيحة ومشتتات منطقية، واشرح الإجابة.", f"المصدر: {title}\nعدد الأسئلة: {count}\n\nالنص:\n{text[:70000]}", "supply_chain_quiz", schema)
    return QuizBank.model_validate(raw)

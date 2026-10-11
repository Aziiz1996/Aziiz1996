from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .auth import require_admin, require_user
from .config import settings
from .firebase import db
from google.cloud import firestore
from .models import EOQRequest, IngestRequest, QuizAnswers, QuizRequest, ROPRequest
from .pipeline import generate_quiz, run_ingestion
from .search import DEFAULT_QUERIES
from .tools import TERMS, economic_order_quantity, reorder_point, seed_terms

app = FastAPI(title="Az Logistics Academic API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=settings().origins, allow_credentials=True, allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type", "X-Admin-Key"])

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/admin/ingest", dependencies=[Depends(require_admin)])
async def ingest(request: IngestRequest):
    queries = request.queries or DEFAULT_QUERIES
    return await run_ingestion(request.course_id, queries, request.limit_per_query)

@app.post("/admin/courses/{course_id}/quizzes", dependencies=[Depends(require_admin)])
async def create_quiz(course_id: str, request: QuizRequest):
    try:
        return await generate_quiz(course_id, request.document_id, request.count)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="المذكرة غير موجودة أو غير معتمدة") from error

@app.post("/admin/terms/seed", dependencies=[Depends(require_admin)])
def seed():
    return {"saved": seed_terms()}

@app.get("/terms")
def terms():
    return {"items": TERMS}

@app.post("/tools/eoq")
def eoq(request: EOQRequest):
    value = economic_order_quantity(request.annual_demand, request.ordering_cost, request.annual_holding_cost_per_unit)
    return {"eoq": round(value, 4), "formula": "sqrt((2 × D × S) / H)"}

@app.post("/tools/reorder-point")
def rop(request: ROPRequest):
    value = reorder_point(request.demand_per_period, request.lead_time_periods, request.safety_stock)
    return {"reorderPoint": round(value, 4), "formula": "d × L + safety stock"}

@app.get("/courses/{course_id}/documents")
def documents(course_id: str, _user=Depends(require_user)):
    rows = db().collection("courses").document(course_id).collection("documents").where("accepted", "==", True).limit(100).stream()
    return {"items": [{"id": row.id, **row.to_dict()} for row in rows]}

@app.get("/courses/{course_id}/quizzes/{quiz_id}")
def quiz(course_id: str, quiz_id: str, _user=Depends(require_user)):
    snapshot = db().collection("courses").document(course_id).collection("quizzes").document(quiz_id).get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="الاختبار غير موجود")
    value = snapshot.to_dict()
    questions = [{"question": item["question"], "choices": item["choices"], "difficulty": item["difficulty"], "topic": item["topic"]} for item in value["questions"]]
    return {"id": snapshot.id, "title": value["title"], "questions": questions}

@app.post("/courses/{course_id}/quizzes/{quiz_id}/grade")
def grade(course_id: str, quiz_id: str, submitted: QuizAnswers, user=Depends(require_user)):
    ref = db().collection("courses").document(course_id).collection("quizzes").document(quiz_id)
    snapshot = ref.get()
    if not snapshot.exists:
        raise HTTPException(status_code=404, detail="الاختبار غير موجود")
    questions = snapshot.to_dict()["questions"]
    if len(submitted.answers) != len(questions):
        raise HTTPException(status_code=400, detail="عدد الإجابات غير مطابق")
    details = [{"correct": answer == question["correct_index"], "correctIndex": question["correct_index"], "explanation": question["explanation"]} for answer, question in zip(submitted.answers, questions)]
    score = sum(item["correct"] for item in details)
    db().collection("users").document(user["uid"]).collection("quiz_attempts").document().set({"courseId": course_id, "quizId": quiz_id, "score": score, "total": len(questions), "createdAt": firestore.SERVER_TIMESTAMP})
    return {"score": score, "total": len(questions), "details": details}

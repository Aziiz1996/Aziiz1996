from __future__ import annotations
import asyncio
from google.cloud import firestore
from .ai import assess_document, make_quiz
from .config import settings
from .documents import download, extract_text, load_extracted_text, sha256, upload_document
from .firebase import db
from .models import SearchHit
from .search import search_documents

async def ingest_one(hit: SearchHit) -> dict:
    content, mime = await download(str(hit.url))
    digest = sha256(content)
    doc_ref = db().collection("courses").document(hit.course_id).collection("documents").document(digest)
    existing = doc_ref.get()
    if existing.exists:
        return {"status": "duplicate", "id": digest}
    text = await asyncio.to_thread(extract_text, content, mime)
    assessment = await assess_document(hit.title, text)
    accepted = assessment.relevant and assessment.academically_sound and assessment.score >= settings().min_academic_score
    metadata = {"title": hit.title, "courseId": hit.course_id, "sourceUrl": str(hit.url), "source": hit.source, "license": hit.license, "year": hit.year, "mimeType": mime, "sha256": digest, "assessment": assessment.model_dump(), "accepted": accepted, "createdAt": firestore.SERVER_TIMESTAMP}
    if accepted:
        metadata.update(await asyncio.to_thread(upload_document, hit.course_id, digest, content, mime, text))
    doc_ref.set(metadata)
    return {"status": "accepted" if accepted else "rejected", "id": digest, "score": assessment.score}

async def run_ingestion(course_id: str, queries: list[str], limit: int) -> dict:
    hits = await search_documents(queries, course_id, limit)
    results = []
    # Sequential processing keeps API/file costs predictable. A task queue can
    # parallelize this worker later without changing the data model.
    for hit in hits:
        try:
            results.append(await ingest_one(hit))
        except Exception as error:
            results.append({"status": "error", "url": str(hit.url), "error": type(error).__name__})
    return {"found": len(hits), "results": results}

async def generate_quiz(course_id: str, document_id: str, count: int) -> dict:
    document = db().collection("courses").document(course_id).collection("documents").document(document_id).get()
    if not document.exists or not document.to_dict().get("accepted"):
        raise ValueError("document-not-found")
    source = document.to_dict()
    text = await asyncio.to_thread(load_extracted_text, source["textStoragePath"])
    quiz = await make_quiz(source["title"], text, count)
    payload = quiz.model_dump() | {"courseId": course_id, "documentId": document_id, "createdAt": firestore.SERVER_TIMESTAMP}
    quiz_ref = db().collection("courses").document(course_id).collection("quizzes").document()
    quiz_ref.set(payload)
    return {"id": quiz_ref.id, **quiz.model_dump()}

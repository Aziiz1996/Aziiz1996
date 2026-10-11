from __future__ import annotations
from urllib.parse import urlparse
import httpx
from .config import settings
from .models import SearchHit

DEFAULT_QUERIES = [
    "ملخصات سلاسل الإمداد",
    "إدارة المخزون والمشتريات PDF",
    "Supply Chain Management notes PDF",
    "Logistics and Transportation study guide",
    "Operations Management cheat sheet",
]

async def search_openalex(query: str, course_id: str, limit: int) -> list[SearchHit]:
    cfg = settings()
    params = {"search": query, "filter": "is_oa:true", "per-page": limit, "select": "id,title,publication_year,best_oa_location"}
    if cfg.openalex_email:
        params["mailto"] = cfg.openalex_email
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get("https://api.openalex.org/works", params=params)
        response.raise_for_status()
    hits = []
    for work in response.json().get("results", []):
        location = work.get("best_oa_location") or {}
        url = location.get("pdf_url")
        license_name = location.get("license")
        if url and license_name:
            hits.append(SearchHit(title=work.get("title") or query, url=url, source="OpenAlex", license=license_name, year=work.get("publication_year"), course_id=course_id))
    return hits

async def search_serper(query: str, course_id: str, limit: int) -> list[SearchHit]:
    cfg = settings()
    if not cfg.serper_api_key:
        return []
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post("https://google.serper.dev/search", headers={"X-API-KEY": cfg.serper_api_key}, json={"q": f"{query} (filetype:pdf OR filetype:pptx)", "num": limit})
        response.raise_for_status()
    hits = []
    for item in response.json().get("organic", []):
        url = item.get("link", "")
        suffix = urlparse(url).path.lower()
        # General search results require an explicit license indicator. This
        # prevents silently redistributing copyrighted course material.
        text = f"{item.get('title','')} {item.get('snippet','')}".lower()
        if suffix.endswith((".pdf", ".pptx")) and any(word in text for word in ("creative commons", "cc by", "open access", "public domain")):
            hits.append(SearchHit(title=item.get("title") or query, url=url, source="Serper", license="declared-open", course_id=course_id))
    return hits

async def search_documents(queries: list[str], course_id: str, limit: int) -> list[SearchHit]:
    unique: dict[str, SearchHit] = {}
    for query in queries:
        results = await search_openalex(query, course_id, limit) + await search_serper(query, course_id, limit)
        for hit in results:
            unique[str(hit.url)] = hit
    return list(unique.values())

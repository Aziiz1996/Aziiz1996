FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY azlogistics ./azlogistics
CMD ["sh", "-c", "uvicorn azlogistics.main:app --host 0.0.0.0 --port ${PORT:-8080}"]

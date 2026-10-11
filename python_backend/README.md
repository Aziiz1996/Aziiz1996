# عز اللوجستيات — Python/Firebase Academic Backend

خدمة مستقلة مبنية بـ FastAPI. تبحث عن مراجع مفتوحة، تفحصها أكاديمياً، ترفع المقبول إلى Firebase Storage، تحفظ الفهرس في Firestore، وتولد اختبارات مرتبطة بالمقرر والمصدر.

## بنية Firestore

```text
courses/{courseId}/documents/{sha256}
courses/{courseId}/quizzes/{quizId}
users/{firebaseUid}/quiz_attempts/{attemptId}
logistics_terms/{termId}
```

يُستخدم SHA-256 كمعرف للمذكرة لمنع تكرار الملف حتى لو ظهر في نتائج بحث مختلفة. يحتفظ سجل الوثيقة برابط المصدر، والترخيص، ونتيجة التقييم، ومسار التخزين. لا يُرفع الملف المرفوض إلى Storage.

## الإعداد المحلي

1. أنشئ مشروع Firebase، ثم فعّل **Firestore** و**Storage** و**Firebase Authentication**.
2. أنشئ Service Account للتشغيل المحلي واحفظ ملفه خارج Git.
3. انسخ `.env.example` إلى `.env` وضع القيم الحقيقية. لا تضع المفتاح أو ملف Service Account في المستودع.
4. شغّل:

```bash
cd python_backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn azlogistics.main:app --reload --port 8080
```

وثائق API التفاعلية: `http://localhost:8080/docs`.

## تشغيل خط جلب المراجع

كل مسارات الإدارة تتطلب `X-Admin-Key`. الكلمات الافتراضية هي الكلمات الخمس المطلوبة ويمكن إرسال قائمة أخرى.

```bash
curl -X POST http://localhost:8080/admin/ingest \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Key: YOUR_ADMIN_KEY' \
  -d '{"course_id":"inventory-management","limit_per_query":5}'
```

البحث الأكاديمي عبر OpenAlex يعمل دون مفتاح، ويقبل النتائج ذات رابط وصول مفتوح وترخيص معلن فقط. البحث العام عن PDF/PPTX يعمل عند إضافة `SERPER_API_KEY`، ولا يقبل النتيجة إلا إذا ظهر فيها تصريح وصول مفتوح. كل تنزيل يمر بفحص HTTPS وعناوين IP العامة والحجم ونوع الملف الحقيقي، ثم يستخرج النص ويقيّمه عبر OpenAI.

## إنشاء اختبار من مذكرة معتمدة

```bash
curl -X POST http://localhost:8080/admin/courses/inventory-management/quizzes \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Key: YOUR_ADMIN_KEY' \
  -d '{"document_id":"SHA256_FROM_DOCUMENT","count":15}'
```

واجهة جلب الاختبار لا ترسل الإجابات الصحيحة. يرسل الطالب إجاباته إلى مسار التصحيح، فيحسب الخادم الدرجة ويعيد الشرح ويحفظ المحاولة.

## المصطلحات والحاسبات

```bash
curl -X POST http://localhost:8080/admin/terms/seed -H 'X-Admin-Key: YOUR_ADMIN_KEY'
curl http://localhost:8080/terms
curl -X POST http://localhost:8080/tools/eoq -H 'Content-Type: application/json' -d '{"annual_demand":10000,"ordering_cost":50,"annual_holding_cost_per_unit":2}'
curl -X POST http://localhost:8080/tools/reorder-point -H 'Content-Type: application/json' -d '{"demand_per_period":40,"lead_time_periods":5,"safety_stock":25}'
```

المعادلات:

- `EOQ = √((2 × الطلب السنوي × تكلفة الطلب) ÷ تكلفة الاحتفاظ السنوية للوحدة)`
- `ROP = الطلب في الفترة × مدة التوريد + مخزون الأمان`

## ربط React وFirebase Authentication

بعد دخول الطالب عبر Firebase Auth، أرسل ID Token إلى الخدمة:

```ts
const token = await firebaseUser.getIdToken();
const response = await fetch(`${PYTHON_API}/courses/${courseId}/documents`, {
  headers: { Authorization: `Bearer ${token}` },
});
const { items } = await response.json();
```

لا تضع `ADMIN_API_KEY` أو `OPENAI_API_KEY` في React. كلاهما خاص بالخادم فقط.

## النشر على Cloud Run

```bash
gcloud run deploy az-logistics-academic \
  --source python_backend \
  --region me-central1 \
  --set-env-vars FIREBASE_PROJECT_ID=PROJECT_ID,FIREBASE_STORAGE_BUCKET=BUCKET,OPENAI_MODEL=gpt-4.1-mini \
  --set-secrets OPENAI_API_KEY=OPENAI_API_KEY:latest,ADMIN_API_KEY=ADMIN_API_KEY:latest
```

امنح Service Account الخاص بـ Cloud Run صلاحيات محدودة: `Cloud Datastore User` و`Storage Object Admin`، وصلاحية Firebase Auth للتحقق من الرموز. انشر `firestore.rules` و`storage.rules` إذا كان الوصول كله عبر الخادم.

للتشغيل المجدول، أنشئ Cloud Scheduler يستدعي `/admin/ingest` أسبوعياً. الأفضل وضع `X-Admin-Key` في Secret Manager أو استخدام Cloud Tasks/OIDC بدلاً من تسجيل المفتاح في نص المهمة.

## فحوص التشغيل

```bash
python -m compileall -q azlogistics
python -m unittest discover -s tests -v
```

تقييم OpenAI يساعد على الفرز ولا يثبت صحة المصدر بمفرده. احتفظ بحق مراجعة إدارية قبل إظهار المذكرات لجميع الطلاب، واحترم ترخيص كل مصدر وسياسة جامعته.

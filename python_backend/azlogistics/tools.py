from math import sqrt

TERMS = [
    {"id":"EOQ", "term":"Economic Order Quantity", "arabic":"الكمية الاقتصادية للطلب", "description":"كمية الطلب التي توازن بين تكلفة إصدار الطلب وتكلفة الاحتفاظ بالمخزون."},
    {"id":"ROP", "term":"Reorder Point", "arabic":"نقطة إعادة الطلب", "description":"مستوى المخزون الذي عنده يبدأ طلب توريد جديد."},
    {"id":"JIT", "term":"Just in Time", "arabic":"في الوقت المحدد", "description":"توريد المواد قريباً من وقت الحاجة لتقليل المخزون والهدر."},
    {"id":"3PL", "term":"Third-Party Logistics", "arabic":"الخدمات اللوجستية للطرف الثالث", "description":"إسناد النقل أو التخزين أو التنفيذ إلى مزود متخصص."},
    {"id":"4PL", "term":"Fourth-Party Logistics", "arabic":"الخدمات اللوجستية للطرف الرابع", "description":"جهة تدير شبكة الموردين ومقدمي الخدمات اللوجستية بصورة تكاملية."},
    {"id":"WMS", "term":"Warehouse Management System", "arabic":"نظام إدارة المستودعات", "description":"نظام لتنظيم الاستلام والتخزين والالتقاط والصرف والجرد."},
    {"id":"TMS", "term":"Transportation Management System", "arabic":"نظام إدارة النقل", "description":"نظام لتخطيط الشحنات والناقلين والمسارات ومتابعة التكلفة والأداء."},
    {"id":"SKU", "term":"Stock Keeping Unit", "arabic":"وحدة حفظ المخزون", "description":"رمز مميز لصنف محدد بخصائصه ووحدته."},
    {"id":"KPI", "term":"Key Performance Indicator", "arabic":"مؤشر الأداء الرئيسي", "description":"مقياس لمتابعة تحقيق هدف تشغيلي مثل دقة الطلب أو زمن التسليم."},
    {"id":"OTIF", "term":"On Time In Full", "arabic":"في الوقت وبالكامل", "description":"نسبة الطلبات التي تصل في موعدها وبالكميات الصحيحة."},
    {"id":"FIFO", "term":"First In First Out", "arabic":"الوارد أولاً يصرف أولاً", "description":"سياسة صرف تبدأ بأقدم مخزون مناسب."},
    {"id":"RFID", "term":"Radio-Frequency Identification", "arabic":"التعريف بموجات الراديو", "description":"تقنية تعرف وتتبع الأصناف لاسلكياً باستخدام الوسوم."},
]

def economic_order_quantity(annual_demand: float, ordering_cost: float, annual_holding_cost_per_unit: float) -> float:
    if min(annual_demand, ordering_cost, annual_holding_cost_per_unit) <= 0:
        raise ValueError("inputs-must-be-positive")
    return sqrt((2 * annual_demand * ordering_cost) / annual_holding_cost_per_unit)

def reorder_point(demand_per_period: float, lead_time_periods: float, safety_stock: float = 0) -> float:
    if min(demand_per_period, lead_time_periods, safety_stock) < 0:
        raise ValueError("inputs-must-be-nonnegative")
    return demand_per_period * lead_time_periods + safety_stock

def seed_terms() -> int:
    from google.cloud import firestore
    from .firebase import db
    batch = db().batch()
    for item in TERMS:
        ref = db().collection("logistics_terms").document(item["id"])
        batch.set(ref, item | {"updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
    batch.commit()
    return len(TERMS)

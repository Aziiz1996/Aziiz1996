import hmac
from fastapi import Header, HTTPException
from firebase_admin import auth
from .config import settings
from .firebase import initialize

def require_admin(x_admin_key: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_admin_key, settings().admin_api_key):
        raise HTTPException(status_code=401, detail="مفتاح الإدارة غير صحيح")

def require_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="تسجيل الدخول مطلوب")
    initialize()
    try:
        return auth.verify_id_token(authorization[7:])
    except Exception as error:
        raise HTTPException(status_code=401, detail="جلسة Firebase غير صالحة") from error

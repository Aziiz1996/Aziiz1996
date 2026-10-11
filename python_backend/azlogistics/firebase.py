import firebase_admin
from firebase_admin import credentials, firestore, storage
from .config import settings

def initialize() -> None:
    if firebase_admin._apps:
        return
    cfg = settings()
    firebase_admin.initialize_app(credentials.ApplicationDefault(), {"projectId": cfg.firebase_project_id, "storageBucket": cfg.firebase_storage_bucket})

def db():
    initialize()
    return firestore.client()

def bucket():
    initialize()
    return storage.bucket()

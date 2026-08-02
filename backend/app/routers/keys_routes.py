from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import PublicKey, User
from ..schemas import KeyUploadSchema

router = APIRouter(prefix="/keys")


@router.put("/upload")
def upload_key(
    payload: KeyUploadSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(PublicKey).filter(PublicKey.user_id == user.id).first()
    if existing:
        existing.rsa_public_key = payload.public_key
    else:
        db.add(PublicKey(user_id=user.id, rsa_public_key=payload.public_key))
    db.commit()
    return {"message": "Public key stored"}


@router.get("/{user_id}")
def fetch_key(
    user_id: int,
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = db.query(PublicKey).filter(PublicKey.user_id == user_id).first()
    if not record:
        return {"rsa_public_key": None, "public_key": None}
    return {"rsa_public_key": record.rsa_public_key, "public_key": record.rsa_public_key}

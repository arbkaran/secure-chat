import base64

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import FileRecord, User

router = APIRouter(prefix="/files")


@router.post("/upload")
async def upload_file(
    receiver_id: int = Form(...),
    encrypted_aes_key: str = Form(...),
    iv: str = Form(...),
    tag: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await file.read()  # already ciphertext — store as-is
    record = FileRecord(
        sender_id=user.id,
        receiver_id=receiver_id,
        filename=file.filename,
        encrypted_blob=content,
        encrypted_aes_key=encrypted_aes_key,
        iv=iv,
        tag=tag,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"file_id": record.id}


@router.get("/{file_id}")
def download_file(
    file_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = db.query(FileRecord).filter(FileRecord.id == file_id).first()
    if not record:
        raise HTTPException(404, "File not found")
    if user.id not in (record.sender_id, record.receiver_id):
        raise HTTPException(403, "Not authorized to access this file")

    return {
        "filename": record.filename,
        "encrypted_aes_key": record.encrypted_aes_key,
        "iv": record.iv,
        "tag": record.tag,
        "ciphertext": base64.b64encode(record.encrypted_blob).decode(),
    }

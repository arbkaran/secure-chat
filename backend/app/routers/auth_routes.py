from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..auth import (
    create_access_token,
    generate_otp,
    get_current_user,
    hash_password,
    verify_password,
)
from ..database import get_db
from ..email_otp import send_otp_email
from ..models import LoginLog, OTPCode, User, Message, PublicKey, FileRecord
from ..schemas import LoginSchema, RegisterSchema, VerifyOtpSchema, UpdateProfileSchema, ForgotPasswordSchema, ResetPasswordSchema
from ..sockets import online_sessions

router = APIRouter(prefix="/auth")

OTP_TTL_MINUTES = 10


@router.post("/register")
def register(payload: RegisterSchema, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(400, "Email already registered")

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    code = generate_otp()
    db.add(
        OTPCode(
            user_id=user.id,
            code=code,
            expires_at=datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES),
        )
    )
    db.commit()

    send_otp_email(user.email, code)
    return {"message": "Registered — check your email for a verification code"}


@router.post("/verify-otp")
def verify_otp(payload: VerifyOtpSchema, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(404, "User not found")

    otp = (
        db.query(OTPCode)
        .filter(OTPCode.user_id == user.id, OTPCode.code == payload.code)
        .order_by(OTPCode.id.desc())
        .first()
    )
    if not otp or otp.used or otp.expires_at < datetime.utcnow():
        raise HTTPException(400, "Invalid or expired code")

    otp.used = True
    user.is_verified = True
    db.commit()
    return {"message": "Account verified"}


@router.post("/login")
def login(payload: LoginSchema, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    success = bool(user) and verify_password(payload.password, user.password_hash)

    db.add(
        LoginLog(
            user_id=user.id if user else None,
            email=payload.email,
            success=success,
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()

    if not user or not success:
        raise HTTPException(401, "Invalid credentials")
    if not user.is_verified:
        raise HTTPException(403, "Account not verified")

    return {"access_token": create_access_token(user.id), "user_id": user.id}


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "is_verified": current_user.is_verified,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }


@router.get("/users")
def get_all_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    users = db.query(User).filter(User.id != current_user.id).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "status": "online" if u.id in online_sessions else "offline",
        }
        for u in users
    ]


@router.get("/users/search")
def search_user(email: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email, User.id != current_user.id).first()
    if not user:
        raise HTTPException(404, "User not found")
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "status": "online" if user.id in online_sessions else "offline",
    }


@router.get("/messages/{contact_id}")
def get_messages(contact_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    messages = (
        db.query(Message)
        .filter(
            ((Message.sender_id == current_user.id) & (Message.receiver_id == contact_id)) |
            ((Message.sender_id == contact_id) & (Message.receiver_id == current_user.id))
        )
        .order_by(Message.timestamp.asc())
        .all()
    )
    return [
        {
            "message_id": m.id,
            "sender_id": m.sender_id,
            "receiver_id": m.receiver_id,
            "encrypted_aes_key": m.encrypted_aes_key,
            "iv": m.iv,
            "tag": m.tag,
            "ciphertext": m.encrypted_content,
            "timestamp": m.timestamp.isoformat(),
        }
        for m in messages
    ]


@router.put("/me")
def update_me(payload: UpdateProfileSchema, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.name = payload.name
    db.commit()
    db.refresh(current_user)
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "is_verified": current_user.is_verified,
    }


@router.delete("/messages")
def delete_all_messages(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Message).filter(
        (Message.sender_id == current_user.id) | (Message.receiver_id == current_user.id)
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": "All messages cleared successfully"}


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordSchema, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        return {"message": "If the email exists, a verification code was sent."}

    code = generate_otp()
    db.add(
        OTPCode(
            user_id=user.id,
            code=code,
            expires_at=datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES),
        )
    )
    db.commit()

    send_otp_email(user.email, code)
    return {"message": "If the email exists, a verification code was sent."}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordSchema, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(404, "User not found")

    otp = (
        db.query(OTPCode)
        .filter(OTPCode.user_id == user.id, OTPCode.code == payload.code)
        .order_by(OTPCode.id.desc())
        .first()
    )
    if not otp or otp.used or otp.expires_at < datetime.utcnow():
        raise HTTPException(400, "Invalid or expired code")

    otp.used = True
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password reset successfully"}


@router.delete("/me")
def delete_account(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = current_user.id
    
    # 1. Delete associated public keys
    db.query(PublicKey).filter(PublicKey.user_id == user_id).delete(synchronize_session=False)
    
    # 2. Delete associated messages
    db.query(Message).filter(
        (Message.sender_id == user_id) | (Message.receiver_id == user_id)
    ).delete(synchronize_session=False)
    
    # 3. Delete associated files
    db.query(FileRecord).filter(
        (FileRecord.sender_id == user_id) | (FileRecord.receiver_id == user_id)
    ).delete(synchronize_session=False)
    
    # 4. Null out user_id in login logs
    db.query(LoginLog).filter(LoginLog.user_id == user_id).update({LoginLog.user_id: None}, synchronize_session=False)
    
    # 5. Delete OTP codes
    db.query(OTPCode).filter(OTPCode.user_id == user_id).delete(synchronize_session=False)
    
    # 6. Delete user
    db.delete(current_user)
    db.commit()
    
    return {"message": "Account and all associated data deleted successfully"}




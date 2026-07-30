from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..auth import (
    create_access_token,
    generate_otp,
    hash_password,
    verify_password,
)
from ..database import get_db
from ..email_otp import send_otp_email
from ..models import LoginLog, OTPCode, User
from ..schemas import LoginSchema, RegisterSchema, VerifyOtpSchema

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

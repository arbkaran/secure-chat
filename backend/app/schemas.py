from pydantic import BaseModel, EmailStr


class RegisterSchema(BaseModel):
    name: str
    email: EmailStr
    password: str


class VerifyOtpSchema(BaseModel):
    email: EmailStr
    code: str


class LoginSchema(BaseModel):
    email: EmailStr
    password: str


class KeyUploadSchema(BaseModel):
    public_key: str


class ConnectionRequestSchema(BaseModel):
    receiver_id: int


class UpdateProfileSchema(BaseModel):
    name: str


class ForgotPasswordSchema(BaseModel):
    email: EmailStr


class ResetPasswordSchema(BaseModel):
    email: EmailStr
    code: str
    new_password: str


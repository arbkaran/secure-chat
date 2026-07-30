import os
import smtplib
from email.message import EmailMessage

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)


def send_otp_email(to_email: str, code: str) -> None:
    print(f"\n==========================================")
    print(f"[DEV OTP CODE] Email: {to_email} | Code: {code}")
    print(f"==========================================\n")
    if not SMTP_USER or "example.com" in SMTP_USER:
        return
    try:
        message = EmailMessage()
        message["Subject"] = "Your SecureChat verification code"
        message["From"] = SMTP_FROM
        message["To"] = to_email
        message.set_content(
            f"Your verification code is {code}. It expires in 10 minutes."
        )

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(message)
    except Exception as e:
        print(f"[SMTP WARNING] Could not send email via SMTP: {e}. Use console OTP code.")


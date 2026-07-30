import socketio

from .auth import decode_token
from .database import SessionLocal
from .models import Message

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# user_id -> sid, for the single most-recently-connected socket per user.
online_sessions: dict[int, str] = {}


def _serialize_message(message: Message) -> dict:
    return {
        "message_id": message.id,
        "sender_id": message.sender_id,
        "receiver_id": message.receiver_id,
        "encrypted_aes_key": message.encrypted_aes_key,
        "iv": message.iv,
        "tag": message.tag,
        "ciphertext": message.encrypted_content,
        "timestamp": message.timestamp.isoformat(),
    }


async def _broadcast_status(user_id: int, status: str) -> None:
    for sid in list(online_sessions.values()):
        await sio.emit("status_update", {"user_id": user_id, "status": status}, to=sid)


async def _deliver_pending_messages(user_id: int, sid: str) -> None:
    db = SessionLocal()
    try:
        pending = (
            db.query(Message)
            .filter(Message.receiver_id == user_id, Message.is_read.is_(False))
            .order_by(Message.id.asc())
            .all()
        )
        for message in pending:
            await sio.emit("message", _serialize_message(message), to=sid)
    finally:
        db.close()


@sio.event
async def connect(sid, environ, auth):
    token = auth.get("token") if auth else None
    if not token:
        raise ConnectionRefusedError("Missing auth token")

    try:
        user_id = decode_token(token)
    except Exception:
        raise ConnectionRefusedError("Invalid or expired token")

    await sio.save_session(sid, {"user_id": user_id})
    online_sessions[user_id] = sid
    await _deliver_pending_messages(user_id, sid)
    await _broadcast_status(user_id, "online")


@sio.event
async def disconnect(sid):
    session = await sio.get_session(sid)
    user_id = session.get("user_id") if session else None
    if user_id is not None and online_sessions.get(user_id) == sid:
        online_sessions.pop(user_id, None)
        await _broadcast_status(user_id, "offline")


@sio.on("message")
async def handle_message(sid, data):
    session = await sio.get_session(sid)
    sender_id = session["user_id"]

    db = SessionLocal()
    try:
        message = Message(
            sender_id=sender_id,
            receiver_id=data["receiver_id"],
            encrypted_content=data["ciphertext"],
            encrypted_aes_key=data["encrypted_aes_key"],
            iv=data["iv"],
            tag=data["tag"],
        )
        db.add(message)
        db.commit()
        db.refresh(message)
        payload = _serialize_message(message)
    finally:
        db.close()

    receiver_sid = online_sessions.get(data["receiver_id"])
    if receiver_sid:
        await sio.emit("message", payload, to=receiver_sid)


@sio.on("typing")
async def handle_typing(sid, data):
    session = await sio.get_session(sid)
    sender_id = session["user_id"]

    receiver_sid = online_sessions.get(data["receiver_id"])
    if receiver_sid:
        await sio.emit("typing", {"sender_id": sender_id}, to=receiver_sid)


@sio.on("read_receipt")
async def handle_read_receipt(sid, data):
    session = await sio.get_session(sid)
    reader_id = session["user_id"]

    db = SessionLocal()
    try:
        message = db.query(Message).filter(Message.id == data["message_id"]).first()
        if message:
            message.is_read = True
            db.commit()
            sender_sid = online_sessions.get(message.sender_id)
            if sender_sid:
                await sio.emit(
                    "read_receipt",
                    {"message_id": message.id, "reader_id": reader_id},
                    to=sender_sid,
                )
    finally:
        db.close()

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Connection, Message, User
from ..schemas import ConnectionRequestSchema
from ..sockets import online_sessions, sio

router = APIRouter(prefix="/connections")


def _other_user_dict(user: User, conn: Connection, current_id: int) -> dict:
    return {
        "connection_id": conn.id,
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "status": "offline",
    }


def _existing_conn(db: Session, user_a: int, user_b: int):
    return db.query(Connection).filter(
        or_(
            and_(Connection.requester_id == user_a, Connection.receiver_id == user_b),
            and_(Connection.requester_id == user_b, Connection.receiver_id == user_a),
        )
    ).first()


@router.get("/search")
def search_users(
    q: str = "",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if len(q.strip()) < 2:
        return []

    matches = (
        db.query(User)
        .filter(
            User.id != user.id,
            User.is_verified.is_(True),
            or_(User.name.ilike(f"%{q}%"), User.email.ilike(f"%{q}%")),
        )
        .limit(25)
        .all()
    )

    result = []
    for u in matches:
        conn = _existing_conn(db, user.id, u.id)
        result.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "connection_status": conn.status if conn else None,
            "connection_id": conn.id if conn else None,
            "is_requester": (conn.requester_id == user.id) if conn else None,
        })
    return result


@router.post("/request")
async def send_request(
    payload: ConnectionRequestSchema,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.receiver_id == user.id:
        raise HTTPException(400, "Cannot send a request to yourself")

    receiver = db.query(User).filter(User.id == payload.receiver_id).first()
    if not receiver:
        raise HTTPException(404, "User not found")

    existing = _existing_conn(db, user.id, payload.receiver_id)
    if existing:
        if existing.status == "accepted":
            raise HTTPException(400, "Already connected")
        if existing.status == "pending":
            raise HTTPException(400, "Request already pending")
        # rejected — allow re-send by resetting
        existing.status = "pending"
        existing.requester_id = user.id
        existing.receiver_id = payload.receiver_id
        db.commit()
        db.refresh(existing)
        conn = existing
    else:
        conn = Connection(requester_id=user.id, receiver_id=payload.receiver_id)
        db.add(conn)
        db.commit()
        db.refresh(conn)

    receiver_sid = online_sessions.get(payload.receiver_id)
    if receiver_sid:
        await sio.emit(
            "connection_request",
            {"connection_id": conn.id, "requester_id": user.id, "requester_name": user.name},
            to=receiver_sid,
        )

    return {"message": "Request sent", "connection_id": conn.id}


@router.get("/")
def get_connections(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conns = db.query(Connection).filter(
        or_(Connection.requester_id == user.id, Connection.receiver_id == user.id),
        Connection.status == "accepted",
    ).all()

    result = []
    for conn in conns:
        other_id = conn.receiver_id if conn.requester_id == user.id else conn.requester_id
        other = db.query(User).filter(User.id == other_id).first()
        if not other:
            continue

        entry = _other_user_dict(other, conn, user.id)

        last_msg = (
            db.query(Message)
            .filter(
                or_(
                    and_(Message.sender_id == user.id, Message.receiver_id == other_id),
                    and_(Message.sender_id == other_id, Message.receiver_id == user.id),
                )
            )
            .order_by(Message.id.desc())
            .first()
        )

        if last_msg:
            entry["last_message"] = {
                "encrypted_aes_key": last_msg.encrypted_aes_key,
                "iv": last_msg.iv,
                "tag": last_msg.tag,
                "ciphertext": last_msg.encrypted_content,
                "sender_id": last_msg.sender_id,
                "timestamp": last_msg.timestamp.isoformat(),
            }
        else:
            entry["last_message"] = None

        result.append(entry)
    return result


@router.get("/pending")
def get_pending(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pending = db.query(Connection).filter(
        Connection.receiver_id == user.id,
        Connection.status == "pending",
    ).all()

    result = []
    for conn in pending:
        requester = db.query(User).filter(User.id == conn.requester_id).first()
        if requester:
            result.append({
                "connection_id": conn.id,
                "id": requester.id,
                "name": requester.name,
                "email": requester.email,
            })
    return result


@router.put("/{connection_id}/accept")
async def accept_connection(
    connection_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn = db.query(Connection).filter(Connection.id == connection_id).first()
    if not conn:
        raise HTTPException(404, "Connection not found")
    if conn.receiver_id != user.id:
        raise HTTPException(403, "Not authorized")
    if conn.status != "pending":
        raise HTTPException(400, "Request is not pending")

    conn.status = "accepted"
    db.commit()

    requester_sid = online_sessions.get(conn.requester_id)
    if requester_sid:
        await sio.emit(
            "connection_accepted",
            {"connection_id": conn.id, "accepted_by_id": user.id, "accepted_by_name": user.name},
            to=requester_sid,
        )

    return {"message": "Connection accepted"}


@router.put("/{connection_id}/reject")
async def reject_connection(
    connection_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn = db.query(Connection).filter(Connection.id == connection_id).first()
    if not conn:
        raise HTTPException(404, "Connection not found")
    if conn.receiver_id != user.id:
        raise HTTPException(403, "Not authorized")
    if conn.status != "pending":
        raise HTTPException(400, "Request is not pending")

    conn.status = "rejected"
    db.commit()

    requester_sid = online_sessions.get(conn.requester_id)
    if requester_sid:
        await sio.emit(
            "connection_rejected",
            {"connection_id": conn.id, "rejected_by_id": user.id, "rejected_by_name": user.name},
            to=requester_sid,
        )

    return {"message": "Connection rejected"}

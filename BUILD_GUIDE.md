# Secure Messaging App — Build Guide

### Stack: Python backend + SQL database + React Native app

This is the same project, re-architected for a mobile app instead of a LAN desktop app. That single change (desktop socket client → phone app) forces a few real architecture decisions below — read this section before Phase 0, it explains _why_ the stack looks different from the original spec.

---

## What changes when you move to React Native, and why

| Original (desktop)                            | This version (mobile)                                       | Why                                                                                                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw TCP sockets                               | **Socket.IO** (WebSocket + auto-reconnect) over the backend | Phones switch networks (WiFi↔cellular), get backgrounded, and drop connections constantly. Raw TCP has no reconnection logic — you'd rebuild it badly. Socket.IO gives you heartbeats and reconnection for free. |
| Custom 4-byte length framing                  | Socket.IO events (`socket.emit("message", payload)`)        | Socket.IO already frames messages for you — you don't need to hand-roll this.                                                                                                                                    |
| CustomTkinter desktop GUI                     | **React Native** (Expo) screens                             | Same encrypted backend, new client.                                                                                                                                                                              |
| Private key file + PBKDF2 password encryption | **expo-secure-store** (iOS Keychain / Android Keystore)     | Phones already have hardware-backed secure storage — use it instead of reinventing at-rest encryption.                                                                                                           |
| Login → raw session dict                      | Login → **JWT token**                                       | REST calls are stateless; the token also authenticates the socket connection.                                                                                                                                    |
| File sent in raw TCP chunks                   | File sent via **HTTPS multipart upload/download**           | Mobile HTTP libraries handle multipart uploads, retries, and progress natively — no reason to hand-roll chunking over a socket.                                                                                  |

**Backend framework:** FastAPI (async, plays well with Socket.IO, and gives you free request validation).
**Real-time layer:** `python-socketio` mounted onto the FastAPI app.
**Database:** Neon (serverless Postgres) via SQLAlchemy (ORM instead of raw parameterized strings — same SQL-injection protection, less boilerplate).
**Mobile app:** React Native via **Expo** (fastest path to a runnable app on a physical phone for LAN testing).
**Client crypto:** `react-native-quick-crypto` (Node-compatible `crypto` API — covers both AES-GCM and RSA-OAEP so you don't need two separate crypto libraries).

The security model from the original spec is unchanged: **the server only ever stores ciphertext and public keys. Private keys never leave the device.**

---

## Phase overview

| Phase | What you build                                         |
| ----- | ------------------------------------------------------ |
| 0     | Backend + Expo app scaffolding                         |
| 1     | SQL schema (SQLAlchemy models)                         |
| 2     | FastAPI + Socket.IO skeleton, app connects to it       |
| 3     | REST + Socket.IO event contract                        |
| 4     | Registration + email OTP + bcrypt                      |
| 5     | Login + JWT issuance                                   |
| 6     | RSA keypair generation on-device + exchange            |
| 7     | AES session key + hybrid encrypt/decrypt (RN + Python) |
| 8     | Real one-to-one encrypted messaging                    |
| 9     | React Native screens (auth, contacts, chat)            |
| 10    | File transfer via HTTPS upload/download                |
| 11    | Presence, typing, read receipts over Socket.IO         |
| 12    | Hardening + real-device LAN testing                    |

---

## Phase 0 — Environment & Project Structure

### Backend

```bash
mkdir backend && cd backend
python3 -m venv venv && source venv/bin/activate
pip install fastapi uvicorn python-socketio sqlalchemy psycopg2-binary \
            bcrypt pycryptodome python-jose python-dotenv passlib
```

### Root project structure

Both halves of the project live under a single root so one `git clone` gets everything:

```
secure-messenger/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + socketio mount
│   │   ├── models.py        # SQLAlchemy models
│   │   ├── database.py      # engine/session
│   │   ├── auth.py          # bcrypt + JWT helpers
│   │   ├── email_otp.py
│   │   ├── sockets.py       # socket.io event handlers
│   │   └── routers/
│   │       ├── auth_routes.py
│   │       ├── keys_routes.py
│   │       └── files_routes.py
│   ├── .env
│   └── requirements.txt
├── frontend/
│   ├── App.js
│   ├── screens/
│   ├── components/
│   ├── crypto/
│   │   ├── keys.js
│   │   └── hybrid.js
│   ├── hooks/
│   │   └── useSocketListener.js
│   └── package.json
└── README.md
```

### Mobile app

```bash
cd secure-messenger
npx create-expo-app frontend
cd frontend
npx expo install socket.io-client expo-secure-store expo-file-system \
                 axios react-navigation @react-navigation/native \
                 @react-navigation/native-stack react-native-quick-crypto
```

**Definition of done:** from `backend/`, `uvicorn app.main:app --reload` starts and responds on `/`; from `frontend/`, the Expo app runs in Expo Go on a physical phone connected to the same WiFi as your dev machine.

---

## Phase 1 — SQL Schema (SQLAlchemy models)

Same six tables as the original spec, expressed as models instead of raw SQL:

```python
# app/models.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class OTPCode(Base):
    __tablename__ = "otp_codes"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    code = Column(String(6), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)

class PublicKey(Base):
    __tablename__ = "public_keys"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    rsa_public_key = Column(Text, nullable=False)   # PEM text

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    receiver_id = Column(Integer, ForeignKey("users.id"))
    encrypted_content = Column(Text, nullable=False)
    encrypted_aes_key = Column(Text, nullable=False)
    iv = Column(String(64), nullable=False)
    tag = Column(String(64), nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    is_read = Column(Boolean, default=False)
```

Write `FileRecord` and `LoginLog` yourself, following the same shape as the original spec's `files` and `login_logs` tables.

```python
# app/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

engine = create_engine(os.getenv("DATABASE_URL"))  # e.g. postgresql+psycopg2://user:pass@<neon-host>/secure_messenger?sslmode=require
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()
```

**Note:** SQLAlchemy's query builder parameterizes values automatically — you get the same SQL-injection protection as manual parameterized queries, as long as you don't drop into raw string-built SQL yourself.

**Definition of done:** `Base.metadata.create_all(engine)` creates all tables in your Neon database; you can insert and query a test user through the ORM.

---

## Connecting to the Database (Neon)

Phase 1's models work against Neon unchanged — Neon is standard Postgres, so SQLAlchemy talks to it exactly like any other Postgres database, just hosted instead of local.

**1. Create a project** at neon.tech — no local install needed. Sign up, create a project, and copy the connection string it gives you.

**2. Driver**

```bash
pip install psycopg2-binary
```

**3. `.env`** — keep `sslmode=require`, since Neon requires SSL:

```
DATABASE_URL=postgresql+psycopg2://app_user:AbCd1234@ep-cool-forest-12345.us-east-2.aws.neon.tech/secure_messenger?sslmode=require
```

**Two Neon-specific things to know:**

- **Pooled vs. direct connection string.** Neon gives you two variants — use the _pooled_ one (routes through their built-in PgBouncer) for your FastAPI app's engine, and the _direct_ one only if you add Alembic migrations later, since some migration operations don't play well through a transaction-mode pooler.
- **Cold starts.** The free tier scales to zero when idle, so the first query after a few idle minutes has a brief delay. A non-issue for LAN testing — just don't be alarmed if the very first login after a break feels slightly slow.
- **Bonus:** Neon supports database branching — you can spin up an isolated copy of your schema to test changes without touching your main data.

### `database.py`

```python
# app/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from dotenv import load_dotenv

load_dotenv()

engine = create_engine(os.getenv("DATABASE_URL"), pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

`pool_pre_ping=True` checks a connection is still alive before using it — worth having since dev databases (and Neon after a cold start) sometimes drop idle connections.

### Creating the tables

```python
# init_db.py
from app.database import engine, Base
from app import models   # import so the models register with Base

Base.metadata.create_all(bind=engine)
print("Tables created")
```

```bash
python init_db.py
```

### Verifying the connection

```python
# test_connection.py
from app.database import engine

with engine.connect() as conn:
    print("Connected successfully:", conn.engine.url)
```

If this throws, check in this order: wrong password → database service not running → wrong port/host.

**Note for later:** running `create_all()` again won't alter existing tables, only create missing ones. Once you're past initial setup, look into **Alembic** (`pip install alembic`) for proper migrations instead of dropping and recreating tables by hand.

---

## Phase 2 — FastAPI + Socket.IO Skeleton

```python
# app/main.py
import socketio
from fastapi import FastAPI

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
app = FastAPI()
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

@app.get("/")
def health():
    return {"status": "ok"}

@sio.event
async def connect(sid, environ, auth):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")
```

Run with: `uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload`

```javascript
// App.js (React Native) — connection test
import { io } from "socket.io-client";

const socket = io("http://<your-backend-lan-ip>:8000", {
  transports: ["websocket"],
});

socket.on("connect", () => console.log("connected:", socket.id));
```

**Pitfall:** `localhost` on the phone means the phone itself, not your dev machine — always use your machine's LAN IP address for the Expo app's socket/API URLs.

**Definition of done:** launching the app on a phone logs `connected: <id>` and the backend terminal logs the matching connection.

---

## Phase 3 — REST + Socket.IO Event Contract

Split responsibilities clearly:

**REST (stateless, request/response):**

```
POST /auth/register        { name, email, password }
POST /auth/verify-otp      { email, code }
POST /auth/login           { email, password } -> { access_token }
PUT  /keys/upload          { public_key }              (auth required)
GET  /keys/{user_id}                                    (auth required)
POST /files/upload         multipart: file + metadata   (auth required)
GET  /files/{file_id}                                   (auth required)
```

**Socket.IO events (real-time, persistent connection):**

```
"message"        client -> server -> receiver   { receiver_id, encrypted_aes_key, iv, tag, ciphertext }
"typing"         client -> server -> receiver   { receiver_id }
"read_receipt"   client -> server -> sender     { message_id }
"status_update"  server -> contacts             { user_id, status }
```

Authenticate the socket connection with the JWT issued at login:

```javascript
const socket = io(BASE_URL, {
  transports: ["websocket"],
  auth: { token: accessToken },
});
```

```python
@sio.event
async def connect(sid, environ, auth):
    token = auth.get("token") if auth else None
    user = verify_jwt(token)   # raise ConnectionRefusedError if invalid
    await sio.save_session(sid, {"user_id": user.id})
```

**Definition of done:** an unauthenticated socket connection is rejected; an authenticated one succeeds and the server can read `user_id` back out of the session on later events.

---

## Phase 4 — Registration + Email OTP + bcrypt

Identical logic to the original spec, expressed as a FastAPI router:

```python
# app/auth.py
import bcrypt, random
from datetime import datetime, timedelta

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())

def generate_otp() -> str:
    return f"{random.SystemRandom().randint(0, 999999):06d}"
```

```python
# app/routers/auth_routes.py
from fastapi import APIRouter, Depends
from datetime import datetime, timedelta

router = APIRouter(prefix="/auth")

@router.post("/register")
def register(payload: RegisterSchema, db=Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(400, "Email already registered")

    user = User(name=payload.name, email=payload.email,
                password_hash=hash_password(payload.password))
    db.add(user); db.commit(); db.refresh(user)

    code = generate_otp()
    db.add(OTPCode(user_id=user.id, code=code,
                    expires_at=datetime.utcnow() + timedelta(minutes=10)))
    db.commit()
    send_otp_email(user.email, code)
    return {"message": "Registered — check your email for a verification code"}
```

Sending the email uses the same `smtplib` pattern as the desktop version — that part of the backend doesn't change at all.

**Definition of done:** hitting `/auth/register` from the Expo app (via `axios.post`) creates a user, and a real OTP email arrives.

---

## Phase 5 — Login + JWT Issuance

```python
from jose import jwt
import os

def create_access_token(user_id: int) -> str:
    return jwt.encode({"sub": str(user_id)}, os.getenv("JWT_SECRET"), algorithm="HS256")

@router.post("/login")
def login(payload: LoginSchema, db=Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    if not user.is_verified:
        raise HTTPException(403, "Account not verified")
    return {"access_token": create_access_token(user.id), "user_id": user.id}
```

React Native side — store the token in secure storage, not `AsyncStorage` (which is unencrypted):

```javascript
import * as SecureStore from "expo-secure-store";
import axios from "axios";

async function login(email, password) {
  const res = await axios.post(`${BASE_URL}/auth/login`, { email, password });
  await SecureStore.setItemAsync("access_token", res.data.access_token);
  return res.data;
}
```

**Definition of done:** a verified user logs in from the app, receives a JWT, and it's retrievable from secure storage on the next app launch (test by killing and reopening the app).

---

## Phase 6 — RSA Keypair Generation & Exchange (on-device)

Generated in React Native now, not on a desktop filesystem:

```javascript
// crypto/keys.js
import { generateKeyPairSync } from "react-native-quick-crypto";
import * as SecureStore from "expo-secure-store";

export async function generateAndStoreKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  // expo-secure-store already uses Keychain (iOS) / Keystore (Android) —
  // no need to hand-roll PBKDF2 + AES like the desktop version did.
  await SecureStore.setItemAsync("rsa_private_key", privateKey);
  return publicKey;
}
```

Upload the public key over REST once generated:

```javascript
await axios.put(
  `${BASE_URL}/keys/upload`,
  { public_key: publicKey },
  { headers: { Authorization: `Bearer ${token}` } },
);
```

```python
@router.put("/keys/upload")
def upload_key(payload: KeyUploadSchema, user=Depends(get_current_user), db=Depends(get_db)):
    existing = db.query(PublicKey).filter(PublicKey.user_id == user.id).first()
    if existing:
        existing.rsa_public_key = payload.public_key
    else:
        db.add(PublicKey(user_id=user.id, rsa_public_key=payload.public_key))
    db.commit()
    return {"message": "Public key stored"}
```

**Definition of done:** on first login, the app generates a keypair, the private key is retrievable from `SecureStore` after an app restart, and the public key appears in the `public_keys` table.

---

## Phase 7 — AES Session Key & Hybrid Encrypt/Decrypt

**Backend (Python)** — same as the desktop version, useful for server-side testing:

```python
from Crypto.Cipher import AES, PKCS1_OAEP
from Crypto.PublicKey import RSA
from Crypto.Random import get_random_bytes

def hybrid_encrypt(plaintext: bytes, receiver_public_pem: str):
    aes_key = get_random_bytes(32)
    nonce = get_random_bytes(12)
    cipher_aes = AES.new(aes_key, AES.MODE_GCM, nonce=nonce)
    ciphertext, tag = cipher_aes.encrypt_and_digest(plaintext)
    cipher_rsa = PKCS1_OAEP.new(RSA.import_key(receiver_public_pem))
    encrypted_aes_key = cipher_rsa.encrypt(aes_key)
    return encrypted_aes_key, nonce, ciphertext, tag
```

**Client (React Native)** — the operation that actually matters, since encryption happens on-device before anything is sent:

```javascript
// crypto/hybrid.js
import {
  createCipheriv,
  createDecipheriv,
  publicEncrypt,
  privateDecrypt,
  randomBytes,
  constants,
} from "react-native-quick-crypto";

export function hybridEncrypt(plaintext, receiverPublicPem) {
  const aesKey = randomBytes(32);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const encryptedAesKey = publicEncrypt(
    { key: receiverPublicPem, padding: constants.RSA_PKCS1_OAEP_PADDING },
    aesKey,
  );

  return {
    encrypted_aes_key: encryptedAesKey.toString("base64"),
    iv: nonce.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export async function hybridDecrypt(packet, privateKeyPem) {
  const aesKey = privateDecrypt(
    { key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(packet.encrypted_aes_key, "base64"),
  );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    aesKey,
    Buffer.from(packet.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(packet.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(packet.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
```

**Pitfall carried over from the desktop version:** never reuse a nonce with the same AES key — generating a fresh AES key per message (as above) avoids this entirely. And always let `decipher.final()` / `decrypt_and_verify()` throw on a bad tag — don't swallow that error, it's your tamper detection.

**Definition of done:** a message encrypted on one phone with `hybridEncrypt` decrypts correctly with `hybridDecrypt` on another, using each other's real keys (test this locally before wiring to sockets).

---

## Phase 8 — Real One-to-One Encrypted Messaging

```javascript
// sending
async function sendMessage(receiverId, text, receiverPublicKey) {
  const packet = hybridEncrypt(text, receiverPublicKey);
  socket.emit("message", { receiver_id: receiverId, ...packet });
}

// receiving
socket.on("message", async (packet) => {
  const privateKey = await SecureStore.getItemAsync("rsa_private_key");
  const text = await hybridDecrypt(packet, privateKey);
  addMessageToChat(packet.sender_id, text);
});
```

```python
# app/sockets.py
@sio.on("message")
async def handle_message(sid, data):
    session = await sio.get_session(sid)
    sender_id = session["user_id"]

    db = SessionLocal()
    db.add(Message(sender_id=sender_id, receiver_id=data["receiver_id"],
                    encrypted_content=data["ciphertext"],
                    encrypted_aes_key=data["encrypted_aes_key"],
                    iv=data["iv"], tag=data["tag"]))
    db.commit()

    receiver_sid = online_sessions.get(data["receiver_id"])   # your own sid<->user_id map
    if receiver_sid:
        await sio.emit("message", {**data, "sender_id": sender_id}, to=receiver_sid)
    # else: it's already saved and will be delivered on next login
```

On login/connect, query and push any `Message` rows where `receiver_id == user.id and is_read == False` — same "deliver pending messages" logic as the desktop version, just sent as Socket.IO events instead of raw framed packets.

**Definition of done:** two phones on the same WiFi network can exchange a message that the server only ever stores/forwards as ciphertext.

---

## Phase 9 — React Native Screens

Screens to build with `@react-navigation/native-stack`:

- `LoginScreen` / `RegisterScreen`
- `OtpVerifyScreen`
- `ContactsScreen` — list of contacts with online/offline dot
- `ChatScreen` — `FlatList` of message bubbles, text input, send button, typing indicator, read-receipt ticks

Wire the socket listener once, near the app root, so it's active regardless of which screen is focused:

```javascript
// hooks/useSocketListener.js
useEffect(() => {
  socket.on("message", handleIncomingMessage);
  socket.on("status_update", handleStatusUpdate);
  socket.on("typing", handleTyping);
  return () => {
    socket.off("message", handleIncomingMessage);
    socket.off("status_update", handleStatusUpdate);
    socket.off("typing", handleTyping);
  };
}, []);
```

Unlike the desktop CustomTkinter version, you don't need a manual thread-safe queue here — `socket.io-client`'s callbacks already run on the JS thread, which is the same thread your React components render on.

**Definition of done:** full register → OTP → login → contacts → chat flow works by tapping through the app on a real phone.

---

## Phase 10 — File Transfer via HTTPS Upload/Download

Encrypt on-device first, then upload the ciphertext as a normal multipart file — mobile HTTP libraries already handle chunked transfer, retries, and progress, so there's no reason to hand-roll socket chunking here.

```javascript
import * as FileSystem from "expo-file-system";

async function sendFile(fileUri, receiverId, receiverPublicKey) {
  const fileBytes = await FileSystem.readAsStringAsync(fileUri, {
    encoding: "base64",
  });
  const packet = hybridEncrypt(
    Buffer.from(fileBytes, "base64"),
    receiverPublicKey,
  );

  const form = new FormData();
  form.append("receiver_id", receiverId);
  form.append("encrypted_aes_key", packet.encrypted_aes_key);
  form.append("iv", packet.iv);
  form.append("tag", packet.tag);
  form.append("file", {
    uri: "data:application/octet-stream;base64," + packet.ciphertext,
    name: "encrypted.bin",
    type: "application/octet-stream",
  });

  await axios.post(`${BASE_URL}/files/upload`, form, {
    headers: {
      "Content-Type": "multipart/form-data",
      Authorization: `Bearer ${token}`,
    },
  });
}
```

```python
@router.post("/files/upload")
async def upload_file(receiver_id: int = Form(...), encrypted_aes_key: str = Form(...),
                       iv: str = Form(...), tag: str = Form(...),
                       file: UploadFile = File(...), user=Depends(get_current_user),
                       db=Depends(get_db)):
    content = await file.read()   # already ciphertext — store as-is
    record = FileRecord(sender_id=user.id, receiver_id=receiver_id, filename=file.filename,
                         encrypted_blob=content, encrypted_aes_key=encrypted_aes_key, iv=iv, tag=tag)
    db.add(record); db.commit()
    notify_receiver_if_online(receiver_id, record.id)
    return {"file_id": record.id}
```

**Definition of done:** a photo sent from one phone decrypts back into a byte-identical image on the receiving phone.

---

## Phase 11 — Presence, Typing, Read Receipts

Same events as the original spec, now over Socket.IO instead of custom protocol messages:

```python
@sio.event
async def connect(sid, environ, auth):
    user = verify_jwt(auth.get("token"))
    online_sessions[user.id] = sid
    await broadcast_status(user.id, "online")

@sio.event
async def disconnect(sid):
    user_id = sid_to_user(sid)
    online_sessions.pop(user_id, None)
    await broadcast_status(user_id, "offline")

@sio.on("typing")
async def handle_typing(sid, data):
    receiver_sid = online_sessions.get(data["receiver_id"])
    if receiver_sid:
        await sio.emit("typing", {"sender_id": sid_to_user(sid)}, to=receiver_sid)
```

Debounce typing events client-side (send at most once every 1–2 seconds of active typing) — same reasoning as the desktop version: it's unencrypted low-sensitivity metadata, but you still shouldn't flood the socket on every keystroke.

**Definition of done:** contact list shows live online/offline status, a typing indicator appears/disappears appropriately, and sent messages show a "read" tick once actually viewed.

---

## Phase 12 — Hardening & Real-Device Testing

**Security checklist (same principles as the desktop version, some items are now more urgent):**

- No plaintext ever logged, stored, or printed on the backend.
- JWT secret is a long random value from `.env`, not hardcoded.
- bcrypt uses `gensalt()`'s default cost factor or higher.
- AES-GCM nonces are never reused per key (guaranteed by generating a fresh AES key per message/file, as above).
- Private keys never leave the device; `expo-secure-store` is used, not `AsyncStorage`.
- **Because a phone is not a trusted LAN like the original desktop scenario, treat the network as hostile even on your home WiFi** — the hybrid encryption already protects message content, but plan to put the backend behind HTTPS/WSS (a reverse proxy like Caddy or nginx with a TLS cert) before this leaves your dev network, since JWTs and metadata still travel in the clear over plain HTTP/WS.
- Backend validates all incoming payload fields (FastAPI + Pydantic schemas give you this largely for free — use them rather than accessing raw request bodies).

**Functional testing on real devices:**

1. Run the backend on your dev machine; find its LAN IP (`ipconfig`/`ifconfig`).
2. Point the Expo app's `BASE_URL` at `http://<lan-ip>:8000`.
3. Run the app via Expo Go on two physical phones on the same WiFi network.
4. Walk through register → verify OTP → login → add contact → chat → send a file, between the two phones.
5. Test killing/reopening the app (JWT and private key should both survive), switching WiFi→cellular mid-session, and sending a message while the other phone is offline.

**Definition of done:** the full flow works between two real phones on the same network, survives an app restart, and no sensitive data appears in backend logs.

---

That's the full stack-adapted roadmap. The cryptographic core (Phase 7) is unchanged in principle from the original desktop spec — only the surrounding plumbing (sockets → Socket.IO, GUI → React Native screens, file socket → HTTPS upload, password-encrypted key file → secure hardware storage) is different. Build and test each phase before moving to the next, same as before.

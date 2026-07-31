import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import auth_routes, files_routes, keys_routes
from .sockets import sio
from .database import Base, engine
from . import models

# Initialize database tables on startup
Base.metadata.create_all(bind=engine)


app = FastAPI(title="SecureChat backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(keys_routes.router)
app.include_router(files_routes.router)


@app.get("/")
def health():
    return {"status": "ok"}


socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

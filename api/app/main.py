from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import schemas
from .db import connect, db_path, user_from_row
from .fixtures import fixture
from .gate import VerificationGate
from .routers import compare, crews, events, matches, media, rank, reviews, verify

app = FastAPI(title="Encore API")

app.add_middleware(VerificationGate)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (media, reviews, compare, rank, events, matches, verify, crews):
    app.include_router(r.router)


@app.get("/users", response_model=list[schemas.User])
def list_users():
    if not db_path().exists():  # before M1's first seed
        return fixture("users.json")
    with connect() as conn:
        return [user_from_row(r) for r in conn.execute("SELECT * FROM users ORDER BY rowid")]

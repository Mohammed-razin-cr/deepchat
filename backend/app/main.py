import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from .database import init_db
from .routers import auth_router, extras_router, messages_router, rooms_router, scheduled_router, tasks_router, users_router


async def _scheduled_loop():
    while True:
        await asyncio.sleep(5)
        try:
            await scheduled_router.dispatch_due_scheduled_messages()
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = asyncio.create_task(_scheduled_loop())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="DeepChat", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(rooms_router.router)
app.include_router(messages_router.router)
app.include_router(tasks_router.router)
app.include_router(scheduled_router.router)
app.include_router(extras_router.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve built frontend if present
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(
            FRONTEND_DIST / "index.html",
            headers={"Cache-Control": "no-cache, must-revalidate"},
        )

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from ..auth import get_current_session
from ..database import get_db
from ..models import RoomTask, UserSession, utcnow
from ..schemas import RoomTaskCreateRequest, RoomTaskUpdateRequest
from ..serializers import serialize_room_task
from ..ws import ws_manager
from .messages_router import _check_room_access

router = APIRouter(tags=["tasks"])


@router.get("/api/rooms/{room_id}/tasks")
def list_room_tasks(
    room_id: int,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    _check_room_access(db, room_id, sess.user, sess.id)
    tasks = (
        db.query(RoomTask)
        .options(joinedload(RoomTask.creator), joinedload(RoomTask.completed_by))
        .filter(RoomTask.room_id == room_id)
        .order_by(RoomTask.completed.asc(), RoomTask.id.desc())
        .all()
    )
    return {"tasks": [serialize_room_task(t) for t in tasks]}


@router.post("/api/rooms/{room_id}/tasks")
async def create_room_task(
    room_id: int,
    payload: RoomTaskCreateRequest,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    _check_room_access(db, room_id, sess.user, sess.id)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Task title cannot be empty")
    task = RoomTask(room_id=room_id, creator_id=sess.user.id, title=title)
    db.add(task)
    db.commit()
    task = (
        db.query(RoomTask)
        .options(joinedload(RoomTask.creator), joinedload(RoomTask.completed_by))
        .filter(RoomTask.id == task.id)
        .first()
    )
    serialized = serialize_room_task(task)
    await ws_manager.broadcast_room(room_id, {"type": "tasks.changed", "room_id": room_id})
    return {"task": serialized}


@router.patch("/api/tasks/{task_id}")
async def update_room_task(
    task_id: int,
    payload: RoomTaskUpdateRequest,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    task = db.query(RoomTask).filter(RoomTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _check_room_access(db, task.room_id, sess.user, sess.id)

    if payload.title is not None:
        cleaned = payload.title.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Task title cannot be empty")
        task.title = cleaned
    if payload.completed is not None:
        task.completed = 1 if payload.completed else 0
        task.completed_by_id = sess.user.id if payload.completed else None
    task.updated_at = utcnow()
    db.commit()
    task = (
        db.query(RoomTask)
        .options(joinedload(RoomTask.creator), joinedload(RoomTask.completed_by))
        .filter(RoomTask.id == task.id)
        .first()
    )
    serialized = serialize_room_task(task)
    await ws_manager.broadcast_room(task.room_id, {"type": "tasks.changed", "room_id": task.room_id})
    return {"task": serialized}


@router.delete("/api/tasks/{task_id}")
async def delete_room_task(
    task_id: int,
    db: Session = Depends(get_db),
    sess: UserSession = Depends(get_current_session),
):
    task = db.query(RoomTask).filter(RoomTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _check_room_access(db, task.room_id, sess.user, sess.id)
    room_id = task.room_id
    db.delete(task)
    db.commit()
    await ws_manager.broadcast_room(room_id, {"type": "tasks.changed", "room_id": room_id})
    return {"ok": True}

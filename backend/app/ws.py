import asyncio
from collections import defaultdict
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.room_connections: dict[int, set[WebSocket]] = defaultdict(set)
        self.room_ws_user: dict[WebSocket, dict] = {}
        self.user_connections: dict[int, set[WebSocket]] = defaultdict(set)
        # room_id -> { user_id: { "user_id": int, "user_name": str, "video": bool, "audio": bool } }
        self.call_participants: dict[int, dict[int, dict]] = defaultdict(dict)

    async def connect_room(self, room_id: int, ws: WebSocket, user_id: int, user_name: str):
        await ws.accept()
        self.room_connections[room_id].add(ws)
        self.room_ws_user[ws] = {"room_id": room_id, "user_id": user_id, "user_name": user_name}

    def disconnect_room(self, room_id: int, ws: WebSocket):
        self.room_connections[room_id].discard(ws)
        info = self.room_ws_user.pop(ws, None)
        return info

    async def connect_user(self, user_id: int, ws: WebSocket):
        await ws.accept()
        self.user_connections[user_id].add(ws)

    def disconnect_user(self, user_id: int, ws: WebSocket):
        self.user_connections[user_id].discard(ws)
        if not self.user_connections[user_id]:
            self.user_connections.pop(user_id, None)

    def get_online_user_ids(self) -> list[int]:
        return [uid for uid, conns in self.user_connections.items() if conns]

    async def broadcast_all_users(self, payload: dict):
        await asyncio.gather(*(self.broadcast_user(uid, payload) for uid in list(self.user_connections.keys())))

    async def broadcast_room(self, room_id: int, payload: dict, exclude_ws: WebSocket | None = None):
        dead = []
        for ws in list(self.room_connections.get(room_id, [])):
            if ws is exclude_ws:
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.room_connections[room_id].discard(ws)
            self.room_ws_user.pop(ws, None)

    async def send_to_room_user(self, room_id: int, target_user_id: int, payload: dict):
        for ws in list(self.room_connections.get(room_id, [])):
            info = self.room_ws_user.get(ws)
            if info and info["user_id"] == target_user_id:
                try:
                    await ws.send_json(payload)
                except Exception:
                    pass

    async def broadcast_user(self, user_id: int, payload: dict):
        dead = []
        for ws in list(self.user_connections.get(user_id, [])):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.user_connections[user_id].discard(ws)

    async def broadcast_users(self, user_ids: list[int], payload: dict):
        await asyncio.gather(*(self.broadcast_user(uid, payload) for uid in set(user_ids)))


ws_manager = ConnectionManager()

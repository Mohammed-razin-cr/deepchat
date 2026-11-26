# DeepChat

DeepChat is a fast, modern, self-hosted team chat & real-time collaboration platform built with **Python (FastAPI + SQLite FTS5 + WebSockets)** and **React (TypeScript + Tailwind CSS + Motion + WebRTC)**.

## Features

- **Rooms, Topics & Private Vaults**: Open rooms, invite-only Private rooms, custom room **Topics**, **Starred** favorites, optional **Passcode Lock**, and **Disappearing Messages** (`1m` / `1h` / `24h`).
- **Direct Messages & Member Profiles**: 1-on-1 and group direct messages, live online presence indicators, and clickable teammate profile inspectors.
- **Group Voice, Video Calls & Voice Notes**: Built-in WebRTC group audio/video calls, screen sharing, shareable call links (`/?room=<id>&call=1`), and in-browser **Voice Note recording**.
- **Threaded Discussions & Mentions Inbox**: Dedicated **Thread Drawer** (`N replies`), **`@Mentions & Replies` Inbox**, grouped message bubbles, markdown & fenced code blocks with copy buttons, pinned messages, emoji boosts, saved bookmarks, `@mentions` autocomplete, and slash commands (`/todo`, `/topic`, `/shrug`, `/tableflip`, `/me`, `/help`).
- **Scheduled Messages, Tasks & Polls**: Schedule future messages (`Send later` / `Send now` queue with background delivery), real-time collaborative **Room Tasks** checklist over WebSockets, and interactive live polls.
- **Files, Media Lightbox & Link Previews**: Drag-and-drop file uploads, inline full-resolution image lightbox, room **Assets Gallery**, and OpenGraph link unfurling.
- **Full-Text Search**: Fast SQLite `FTS5` search (`Ctrl+K`) with search history.
- **Web Push & Bot API**: VAPID Web Push notifications and webhook Bot API (`POST /api/rooms/{room_id}/{bot_key}/messages`).

## Running Locally

### Windows (PowerShell)
```powershell
./start.ps1
```
Then open **http://localhost:3000**.

### Manual Start
```sh
# 1. Build frontend
cd frontend
npm install
npm run build

# 2. Start backend (serves API, WebSockets, and built frontend)
cd ../backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 3000
```

### Docker
```sh
docker build -t deepchat .
docker run -d --name deepchat -p 3000:3000 -v deepchat_data:/app/backend/storage deepchat
```

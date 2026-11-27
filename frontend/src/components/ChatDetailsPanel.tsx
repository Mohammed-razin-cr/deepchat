import { useState } from 'react';
import {
  ArrowSquareOut,
  BellRinging,
  BellSlash,
  CheckSquare,
  DownloadSimple,
  FileText,
  Hash,
  LockKey,
  Play,
  Plus,
  PushPin,
  ShareNetwork,
  Star,
  Timer,
  Trash,
  UsersThree,
  X,
} from '@phosphor-icons/react';
import type { Message, Room, RoomTask } from '../types';
import { formatError } from '../utils/errors';
import { safeHostname } from '../utils/url';

interface ChatDetailsPanelProps {
  room: Room;
  messages: Message[];
  tasks: RoomTask[];
  pinnedCount: number;
  onClose: () => void;
  onToggleMute: () => void;
  onToggleStar: () => void;
  onOpenPinned: () => void;
  onOpenShare: () => void;
  onOpenMembers: () => void;
  onOpenAssets: (tab: 'media' | 'files' | 'links') => void;
  onPreviewImage: (img: { url: string; filename: string }) => void;
  onCreateTask: (title: string) => Promise<void>;
  onToggleTask: (task: RoomTask) => Promise<void>;
  onDeleteTask: (taskId: number) => Promise<void>;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatDetailsPanel({
  room,
  messages,
  tasks,
  pinnedCount,
  onClose,
  onToggleMute,
  onToggleStar,
  onOpenPinned,
  onOpenShare,
  onOpenMembers,
  onOpenAssets,
  onPreviewImage,
  onCreateTask,
  onToggleTask,
  onDeleteTask,
}: ChatDetailsPanelProps) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskError, setTaskError] = useState('');

  const mediaAttachments = messages.flatMap((m) =>
    (m.attachments || []).filter((a) => a.content_type.startsWith('image/') || a.content_type.startsWith('video/'))
  );
  const fileAttachments = messages.flatMap((m) =>
    (m.attachments || []).filter(
      (a) => !a.content_type.startsWith('image/') && !a.content_type.startsWith('video/')
    )
  );
  const sharedLinks = messages
    .map((m) => {
      if (m.unfurl?.url) {
        return { url: m.unfurl.url, title: m.unfurl.title || safeHostname(m.unfurl.url) };
      }
      const match = m.body?.match(/https?:\/\/[^\s]+/);
      return match ? { url: match[0], title: safeHostname(match[0]) } : null;
    })
    .filter((x): x is { url: string; title: string } => x !== null);

  const isMuted = room.involvement === 'nothing';

  const exportMarkdown = () => {
    const safeName =
      (room.display_name || 'room')
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-|-$/g, '') || 'room';
    const lines: string[] = [
      `# ${room.type === 'direct' ? `@${room.display_name}` : `#${room.display_name}`}`,
      `Exported: ${new Date().toISOString()}`,
    ];
    if (room.topic) lines.push(`Topic: ${room.topic}`);
    lines.push('');

    if (tasks.length > 0) {
      lines.push('## Room Tasks', '');
      for (const t of tasks) {
        lines.push(`- [${t.completed ? 'x' : ' '}] ${t.title} _(${t.creator_name})_`);
      }
      lines.push('');
    }

    lines.push('## Messages', '');
    for (const m of messages) {
      const ts = new Date(m.created_at).toLocaleString();
      const author = m.creator?.name || 'Unknown';
      const pinTag = m.is_pinned ? ' [Pinned]' : '';
      lines.push(`### ${author} - ${ts}${pinTag}`);
      if (m.reply_to) {
        lines.push(`> Replying to **${m.reply_to.creator_name}**: ${m.reply_to.body}`);
      }
      if (m.body) lines.push(m.body);
      for (const att of m.attachments || []) {
        lines.push(`- Attachment: [${att.filename}](${att.url})`);
      }
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}-transcript.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || taskBusy) return;
    setTaskError('');
    setTaskBusy(true);
    try {
      await onCreateTask(newTaskTitle.trim());
      setNewTaskTitle('');
    } catch (err) {
      setTaskError(formatError(err, 'Failed to add task'));
    } finally {
      setTaskBusy(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="fixed right-0 top-0 bottom-0 z-50 lg:static lg:z-auto flex w-72 shrink-0 flex-col h-full bg-[#F4F2FA] dark:bg-[#0D0A18] border-l border-violet-200/70 dark:border-white/[0.08] overflow-y-auto shadow-2xl lg:shadow-none">
        <div className="px-4 py-3.5 border-b border-violet-200/60 dark:border-white/[0.06] flex items-center justify-between">
          <h3 className="font-bold text-sm text-zinc-900 dark:text-white">Chat Details</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Chat Details"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-violet-500/10 cursor-pointer"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Room Summary Card */}
          <div className="p-3.5 rounded-2xl glass-panel space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-violet-600/25">
                {room.type === 'open' ? (
                  <Hash size={18} weight="bold" />
                ) : room.type === 'closed' ? (
                  <LockKey size={18} weight="duotone" />
                ) : (
                  <UsersThree size={18} weight="duotone" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">{room.display_name}</div>
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-violet-200/60">
                  <span>
                    {room.members.length} {room.members.length === 1 ? 'member' : 'members'}
                  </span>
                  {room.disappear_seconds && (
                    <span className="inline-flex items-center gap-0.5 text-violet-500 font-semibold">
                      · <Timer size={11} weight="duotone" />
                      {room.disappear_seconds < 3600
                        ? `${Math.round(room.disappear_seconds / 60)}m`
                        : `${Math.round(room.disappear_seconds / 3600)}h`}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleStar}
                title={room.is_starred ? 'Unstar room' : 'Star room'}
                aria-label={room.is_starred ? 'Unstar room' : 'Star room'}
                className={`p-1.5 rounded-xl transition cursor-pointer ${
                  room.is_starred ? 'text-amber-400 bg-amber-400/15' : 'text-zinc-400 hover:text-amber-400'
                }`}
              >
                <Star size={16} weight={room.is_starred ? 'fill' : 'duotone'} />
              </button>
            </div>
            {room.topic && (
              <p className="text-[11px] text-zinc-600 dark:text-violet-200/70 leading-relaxed pt-1 border-t border-violet-200/40 dark:border-white/[0.06]">
                {room.topic}
              </p>
            )}
          </div>

          {/* 4 Quick Action Glass Tiles */}
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              title={isMuted ? 'Unmute room' : 'Mute room'}
              aria-label={isMuted ? 'Unmute room' : 'Mute room'}
              className={`p-3 rounded-2xl glass-panel flex items-center justify-center transition cursor-pointer ${
                isMuted ? 'text-rose-400 border-rose-400/35' : 'text-zinc-700 dark:text-zinc-200 hover:border-violet-400/50'
              }`}
            >
              {isMuted ? <BellSlash size={18} weight="duotone" /> : <BellRinging size={18} weight="duotone" />}
            </button>
            <button
              type="button"
              onClick={onOpenPinned}
              title={`Pinned messages (${pinnedCount})`}
              aria-label="Pinned messages"
              className="relative p-3 rounded-2xl glass-panel text-zinc-700 dark:text-zinc-200 hover:border-violet-400/50 flex items-center justify-center transition cursor-pointer"
            >
              <PushPin size={18} weight="duotone" />
              {pinnedCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {pinnedCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onOpenShare}
              title="Share link"
              aria-label="Share link"
              className="p-3 rounded-2xl glass-panel text-zinc-700 dark:text-zinc-200 hover:border-violet-400/50 flex items-center justify-center transition cursor-pointer"
            >
              <ShareNetwork size={18} weight="duotone" />
            </button>
            <button
              type="button"
              onClick={onOpenMembers}
              title="Room members"
              aria-label="Room members"
              className="p-3 rounded-2xl glass-panel text-zinc-700 dark:text-zinc-200 hover:border-violet-400/50 flex items-center justify-center transition cursor-pointer"
            >
              <UsersThree size={18} weight="duotone" />
            </button>
          </div>

          <button
            type="button"
            disabled={messages.length === 0}
            onClick={exportMarkdown}
            className="w-full py-2 px-3 rounded-xl glass-panel hover:border-violet-400/50 disabled:opacity-45 text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <DownloadSimple size={15} weight="duotone" className="text-violet-500" />
            Export Chat (.md)
          </button>

          {/* Shared Room Tasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5">
                <CheckSquare size={14} weight="duotone" className="text-violet-500" />
                Room Tasks
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-violet-500/12 text-violet-600 dark:text-violet-300 text-[10px] font-mono font-semibold">
                {tasks.filter((t) => !t.completed).length}
              </span>
            </div>

            {taskError && <p className="text-[11px] text-rose-500 mb-1.5">{taskError}</p>}

            <form onSubmit={handleAddTask} className="flex items-center gap-1.5 mb-2.5">
              <input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Add action item..."
                aria-label="Add room task"
                className="flex-1 min-w-0 px-3 py-1.5 rounded-xl glass-panel text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-violet-400"
              />
              <button
                type="submit"
                disabled={!newTaskTitle.trim() || taskBusy}
                aria-label="Create task"
                className="p-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white cursor-pointer"
              >
                <Plus size={14} weight="bold" />
              </button>
            </form>

            {tasks.length === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">No tasks yet. Track action items here.</p>
            ) : (
              <div className="space-y-1.5">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-2 p-2 rounded-xl glass-panel text-xs group"
                  >
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() =>
                        onToggleTask(task).catch((err) => setTaskError(formatError(err, 'Failed to update task')))
                      }
                      aria-label={`Mark ${task.title} ${task.completed ? 'incomplete' : 'complete'}`}
                      className="mt-0.5 cursor-pointer"
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className={`break-words ${
                          task.completed ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-100'
                        }`}
                      >
                        {task.title}
                      </div>
                      {task.completed && task.completed_by_name && (
                        <div className="text-[10px] text-zinc-400">Done by {task.completed_by_name}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onDeleteTask(task.id).catch((err) => setTaskError(formatError(err, 'Failed to delete task')))
                      }
                      aria-label={`Delete task ${task.title}`}
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-zinc-400 hover:text-rose-500 p-0.5 cursor-pointer"
                    >
                      <Trash size={12} weight="duotone" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Photos & Videos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5">
                Photos and Videos
                <span className="px-1.5 py-0.5 rounded-full bg-violet-500/12 text-violet-600 dark:text-violet-300 text-[10px] font-mono font-semibold">
                  {mediaAttachments.length}
                </span>
              </span>
              {mediaAttachments.length > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenAssets('media')}
                  className="text-[11px] font-semibold text-violet-500 hover:underline cursor-pointer"
                >
                  See all
                </button>
              )}
            </div>
            {mediaAttachments.length === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">No media shared yet</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {mediaAttachments.slice(0, 4).map((att) =>
                  att.content_type.startsWith('image/') ? (
                    <button
                      type="button"
                      key={att.id}
                      onClick={() => onPreviewImage({ url: att.url, filename: att.filename })}
                      className="group relative aspect-square rounded-2xl overflow-hidden border border-violet-200/50 dark:border-white/10 bg-black/20 cursor-pointer"
                    >
                      <img
                        src={att.url}
                        alt={att.filename}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                      />
                    </button>
                  ) : (
                    <a
                      key={att.id}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-square rounded-2xl overflow-hidden border border-violet-200/50 dark:border-white/10 bg-black/20"
                    >
                      <video src={att.url} className="w-full h-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                        <Play size={20} weight="fill" />
                      </span>
                    </a>
                  )
                )}
              </div>
            )}
          </div>

          {/* Shared Files */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5">
                Shared Files
                <span className="px-1.5 py-0.5 rounded-full bg-violet-500/12 text-violet-600 dark:text-violet-300 text-[10px] font-mono font-semibold">
                  {fileAttachments.length}
                </span>
              </span>
              {fileAttachments.length > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenAssets('files')}
                  className="text-[11px] font-semibold text-violet-500 hover:underline cursor-pointer"
                >
                  See all
                </button>
              )}
            </div>
            {fileAttachments.length === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">No files shared yet</p>
            ) : (
              <div className="space-y-2">
                {fileAttachments.slice(0, 4).map((att) => (
                  <a
                    key={att.id}
                    href={att.url}
                    download={att.filename}
                    className="flex items-center gap-2.5 p-2.5 rounded-2xl glass-panel hover:border-violet-400/50 transition"
                  >
                    <div className="w-8 h-8 rounded-xl bg-violet-500/15 text-violet-500 dark:text-violet-300 flex items-center justify-center shrink-0">
                      <FileText size={16} weight="duotone" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                        {att.filename}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">{formatFileSize(att.byte_size)}</div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Shared Links */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5">
                Shared Links
                <span className="px-1.5 py-0.5 rounded-full bg-violet-500/12 text-violet-600 dark:text-violet-300 text-[10px] font-mono font-semibold">
                  {sharedLinks.length}
                </span>
              </span>
              {sharedLinks.length > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenAssets('links')}
                  className="text-[11px] font-semibold text-violet-500 hover:underline cursor-pointer"
                >
                  See all
                </button>
              )}
            </div>
            {sharedLinks.length === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">No links shared yet</p>
            ) : (
              <div className="space-y-2">
                {sharedLinks.slice(0, 4).map((lnk, idx) => (
                  <a
                    key={idx}
                    href={lnk.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 p-2.5 rounded-2xl glass-panel hover:border-violet-400/50 transition"
                  >
                    <div className="w-8 h-8 rounded-xl bg-violet-500/15 text-violet-500 dark:text-violet-300 flex items-center justify-center shrink-0">
                      <ArrowSquareOut size={15} weight="bold" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{lnk.title}</div>
                      <div className="text-[10px] text-zinc-400 truncate">{lnk.url}</div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

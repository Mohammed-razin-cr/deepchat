import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowBendUpLeft,
  BellRinging,
  BellSlash,
  ChartBar,
  Clock,
  Code,
  CodeBlock,
  Hash,
  List,
  LockKey,
  Microphone,
  PaperPlaneTilt,
  Paperclip,
  PhoneCall,
  PushPin,
  Quotes,
  ShareNetwork,
  SidebarSimple,
  SlidersHorizontal,
  SmileyWink,
  Star,
  StopCircle,
  TextAa,
  TextB,
  TextItalic,
  Timer,
  UsersThree,
  VideoCamera,
  X,
} from '@phosphor-icons/react';
import { api } from '../api';
import type { Attachment, CallParticipant, Message, Room, ScheduledMessage, Unfurl, User } from '../types';
import { Avatar } from './Avatar';
import { MessageItem } from './chat/MessageItem';

const COMPOSER_EMOJIS = ['😀', '😂', '🥳', '🔥', '❤️', '👍', '👏', '🎉', '🚀', '👀', '💡', '✅', '⚡', '🙏', '💯', '🤔'];
const SLASH_COMMANDS = [
  { cmd: '/todo', desc: 'Add an action item to Room Tasks', fill: '/todo ' },
  { cmd: '/topic', desc: 'Update the room topic', fill: '/topic ' },
  { cmd: '/shrug', desc: 'Append ¯\\_(ツ)_/¯', fill: '/shrug ' },
  { cmd: '/tableflip', desc: 'Append (╯°□°)╯︵ ┻━┻', fill: '/tableflip ' },
  { cmd: '/me', desc: 'Send an italic action message', fill: '/me ' },
  { cmd: '/help', desc: 'Show available slash commands', fill: '/help' },
];

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function canGroupMessages(a: Message | null, b: Message | null): boolean {
  if (!a || !b) return false;
  if (!a.creator || !b.creator || a.creator.id !== b.creator.id) return false;
  if (new Date(a.created_at).toDateString() !== new Date(b.created_at).toDateString()) return false;
  return Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) <= GROUP_WINDOW_MS;
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface ChatAreaProps {
  room: Room | null;
  currentUser: User;
  messages: Message[];
  scheduledMessages: ScheduledMessage[];
  highlightMessageId: number | null;
  hasMore: boolean;
  typingUsers: string[];
  callParticipants: CallParticipant[];
  inCall: boolean;
  isLocked: boolean;
  showDetails: boolean;
  showPinned: boolean;
  onTogglePinned: () => void;
  onClosePinned: () => void;
  onToggleDetails: () => void;
  onToggleStar: () => Promise<void>;
  onUpdateTopic: (topic: string) => Promise<void>;
  onCreateTask: (title: string) => Promise<void>;
  onScheduleMessage: (body: string, sendAtIso: string, attachments: Attachment[], replyToId?: number | null) => Promise<void>;
  onSendScheduledNow: (itemId: number) => Promise<void>;
  onCancelScheduled: (itemId: number) => Promise<void>;
  onOpenThread: (messageId: number) => void;
  onInspectUser: (user: User) => void;
  onPreviewImage: (img: { url: string; filename: string }) => void;
  onClearHighlight: () => void;
  onUnlockRoom: (passcode: string) => Promise<void>;
  onStartCall: (video: boolean) => void;
  onOpenShare: () => void;
  onOpenMembers: () => void;
  onOpenCreatePoll: () => void;
  onVotePoll: (messageId: number, optionId: number) => Promise<void>;
  onOpenMobileSidebar: () => void;
  onOpenRoomSettings: () => void;
  onLoadMore: () => void;
  onSendMessage: (body: string, attachments: Attachment[], unfurl: Unfurl | null, replyToId?: number | null) => Promise<void>;
  onEditMessage: (id: number, body: string) => Promise<void>;
  onDeleteMessage: (id: number) => Promise<void>;
  onToggleBoost: (id: number, emoji: string) => Promise<void>;
  onTogglePin: (id: number) => Promise<void>;
  onToggleBookmark: (id: number) => Promise<void>;
  onForwardMessage: (msg: Message) => void;
  onChangeInvolvement: (involvement: Room['involvement']) => Promise<void>;
  onTyping: () => void;
}

export function ChatArea({
  room,
  currentUser,
  messages,
  scheduledMessages,
  highlightMessageId,
  hasMore,
  typingUsers,
  callParticipants,
  inCall,
  isLocked,
  showDetails,
  showPinned,
  onTogglePinned,
  onClosePinned,
  onToggleDetails,
  onToggleStar,
  onUpdateTopic,
  onCreateTask,
  onScheduleMessage,
  onSendScheduledNow,
  onCancelScheduled,
  onOpenThread,
  onInspectUser,
  onPreviewImage,
  onClearHighlight,
  onUnlockRoom,
  onStartCall,
  onOpenShare,
  onOpenMembers,
  onOpenCreatePoll,
  onVotePoll,
  onOpenMobileSidebar,
  onOpenRoomSettings,
  onLoadMore,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onToggleBoost,
  onTogglePin,
  onToggleBookmark,
  onForwardMessage,
  onChangeInvolvement,
  onTyping,
}: ChatAreaProps) {
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showComposerEmojis, setShowComposerEmojis] = useState(false);
  const [showFormatBar, setShowFormatBar] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [emojiMenuFor, setEmojiMenuFor] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<User[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [actionError, setActionError] = useState('');
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [customSchedule, setCustomSchedule] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (highlightMessageId) {
      const el = document.getElementById(`msg-${highlightMessageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-violet-400');
        const t = setTimeout(() => {
          el.classList.remove('ring-2', 'ring-violet-400');
          onClearHighlight();
        }, 2000);
        return () => clearTimeout(t);
      }
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [room?.id, messages.length, highlightMessageId, onClearHighlight]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (mentionQuery === null) return;
    let cancelled = false;
    api
      .autocompleteUsers(mentionQuery)
      .then((res) => {
        if (!cancelled) setMentionUsers(res.users);
      })
      .catch(() => {
        if (!cancelled) setMentionUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mentionQuery]);

  const runAction = async (fn: () => Promise<void>, fallbackMsg: string) => {
    setActionError('');
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error && err.message ? err.message : fallbackMsg);
    }
  };

  const stopRecordingTimer = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const startVoiceNote = async () => {
    setActionError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      recordChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        stopRecordingTimer();
        setRecording(false);
        const chunks = recordChunksRef.current;
        if (chunks.length === 0) return;
        const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
        const file = new File([new Blob(chunks, { type: mimeType })], `voice-note-${Date.now()}.${ext}`, {
          type: mimeType,
        });
        setUploading(true);
        try {
          const uploaded = await api.uploadFile(file);
          await onSendMessage('', [uploaded.attachment], null, replyTo?.id ?? null);
          setReplyTo(null);
        } catch (err) {
          setActionError(err instanceof Error && err.message ? err.message : 'Failed to send voice note');
        } finally {
          setUploading(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecordSeconds(0);
      setRecording(true);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (err) {
      setActionError(err instanceof Error && err.message ? err.message : 'Microphone permission denied');
    }
  };

  const stopVoiceNote = (discard: boolean) => {
    if (discard) {
      recordChunksRef.current = [];
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      stopRecordingTimer();
      setRecording(false);
    }
  };

  if (!room) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#FAF8FE] dark:bg-[#090710] text-zinc-400 p-6">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="md:hidden mb-4 px-5 py-2.5 rounded-full bg-gradient-to-r from-violet-600 to-purple-500 text-white text-sm font-semibold"
        >
          Open Rooms
        </button>
        <p className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">Select a room to start chatting</p>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#FAF8FE] dark:bg-[#090710] p-6 relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 w-96 h-96 rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="relative z-10 w-full max-w-sm p-7 rounded-3xl glass-panel shadow-2xl text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-violet-500/15 text-violet-400 flex items-center justify-center">
            <LockKey size={26} weight="duotone" />
          </div>
          <div>
            <h3 className="font-bold text-base text-zinc-900 dark:text-white">{room.display_name} is Locked</h3>
            <p className="text-xs text-zinc-500 dark:text-violet-200/60 mt-1">
              Enter the room passcode to view and send private messages.
            </p>
          </div>
          {unlockError && (
            <div role="alert" className="px-3 py-2 rounded-xl bg-rose-500/15 text-rose-400 text-xs">
              {unlockError}
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setUnlockError('');
              try {
                await onUnlockRoom(passcodeInput);
                setPasscodeInput('');
              } catch (err) {
                setUnlockError(err instanceof Error && err.message ? err.message : 'Incorrect passcode');
              }
            }}
            className="space-y-3"
          >
            <input
              type="password"
              required
              autoFocus
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              placeholder="Enter passcode..."
              className="w-full px-4 py-2.5 rounded-xl bg-white/80 dark:bg-white/[0.06] border border-violet-200 dark:border-white/10 text-sm text-center text-zinc-900 dark:text-white focus:outline-none focus:border-violet-400"
            />
            <button
              type="submit"
              className="w-full py-2.5 rounded-full bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 text-white text-sm font-semibold cursor-pointer transition"
            >
              Unlock Private Chat
            </button>
          </form>
        </div>
      </div>
    );
  }

  const pinnedMessages = messages.filter((m) => m.is_pinned);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setActionError('');
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const f of Array.from(files)) {
        const res = await api.uploadFile(f);
        uploaded.push(res.attachment);
      }
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setActionError(err instanceof Error && err.message ? err.message : 'File upload failed');
    } finally {
      setUploading(false);
    }
  };

  const applyFormat = (prefix: string, suffix: string, placeholder: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const selected = draft.slice(start, end) || placeholder;
    const before = draft.slice(0, start);
    const after = draft.slice(end);
    setDraft(`${before}${prefix}${selected}${suffix}${after}`);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      const selStart = start + prefix.length;
      textareaRef.current.setSelectionRange(selStart, selStart + selected.length);
    });
  };

  const handleDraftChange = (val: string) => {
    setDraft(val);
    onTyping();
    const cursor = textareaRef.current?.selectionStart ?? val.length;
    const beforeCursor = val.slice(0, cursor);
    const match = beforeCursor.match(/@([A-Za-z0-9_.-]*)$/);
    if (match) {
      setMentionQuery(match[1]);
    } else {
      setMentionQuery(null);
      setMentionUsers([]);
    }
  };

  const insertMention = (user: User) => {
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor);
    const after = draft.slice(cursor);
    const replaced = before.replace(/@([A-Za-z0-9_.-]*)$/, `@${user.name} `);
    setDraft(replaced + after);
    setMentionQuery(null);
    setMentionUsers([]);
    textareaRef.current?.focus();
  };

  const scrollToMessage = (id: number) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-violet-500/60');
      setTimeout(() => el.classList.remove('ring-2', 'ring-violet-500/60'), 1400);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!draft.trim() && attachments.length === 0) || sending) return;

    const rawDraft = draft;
    let text = rawDraft;
    const trimmed = text.trim();

    if (trimmed === '/help') {
      setDraft('**Slash commands:** `/todo <task>` · `/topic <text>` · `/shrug` · `/tableflip` · `/me <action>`');
      return;
    }
    if (trimmed.startsWith('/topic ')) {
      const nextTopic = trimmed.slice(7).trim();
      setDraft('');
      await runAction(() => onUpdateTopic(nextTopic), 'Failed to update room topic');
      return;
    }
    if (trimmed.startsWith('/todo ')) {
      const taskTitle = trimmed.slice(6).trim();
      if (taskTitle) {
        setDraft('');
        await runAction(() => onCreateTask(taskTitle), 'Failed to create room task');
        return;
      }
    }

    if (trimmed.startsWith('/shrug')) {
      text = `${trimmed.replace(/^\/shrug\s*/, '')} ¯\\_(ツ)_/¯`.trim();
    } else if (trimmed.startsWith('/tableflip')) {
      text = `${trimmed.replace(/^\/tableflip\s*/, '')} (╯°□°)╯︵ ┻━┻`.trim();
    } else if (trimmed.startsWith('/me ')) {
      text = `*${trimmed.slice(4)}*`;
    }

    setActionError('');
    setSending(true);
    const files = attachments;
    const replySnapshot = replyTo;
    setDraft('');
    setAttachments([]);
    setReplyTo(null);
    setMentionQuery(null);
    setMentionUsers([]);
    setShowComposerEmojis(false);

    let unfurl: Unfurl | null = null;
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      try {
        const res = await api.unfurl(urlMatch[0]);
        unfurl = res.unfurl;
      } catch {
        // link preview is best-effort
      }
    }

    try {
      await onSendMessage(text, files, unfurl, replySnapshot?.id ?? null);
    } catch (err) {
      setDraft(rawDraft);
      setAttachments(files);
      setReplyTo(replySnapshot);
      setActionError(err instanceof Error && err.message ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="flex-1 flex flex-col h-full bg-[#FAF8FE] dark:bg-[#090710] relative min-w-0 overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      {/* Signature Violet-Indigo Atmospheric Silk Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 left-1/3 -translate-x-1/2 w-[560px] h-[250px] rounded-full bg-violet-600/14 dark:bg-violet-600/22 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-12 right-1/4 w-[420px] h-[220px] rounded-full bg-indigo-500/8 dark:bg-purple-500/12 blur-[130px]"
      />

      {dragOver && (
        <div className="absolute inset-0 z-30 bg-violet-600/15 backdrop-blur-xs border-2 border-dashed border-violet-500 flex items-center justify-center pointer-events-none">
          <div className="px-6 py-4 rounded-2xl glass-panel shadow-xl font-semibold text-violet-600 dark:text-violet-300">
            Drop files to attach
          </div>
        </div>
      )}

      {/* Room Header */}
      <header className="relative z-10 px-4 sm:px-6 py-3 border-b border-violet-200/60 dark:border-white/[0.08] flex items-center justify-between gap-3 bg-white/80 dark:bg-[#0D0A18]/85 backdrop-blur-xl">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            aria-label="Open menu"
            className="md:hidden p-2 -ml-1 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-violet-500/10 cursor-pointer"
          >
            <List size={20} weight="bold" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/25 text-violet-600 dark:text-violet-300 flex items-center justify-center shrink-0 border border-violet-400/25 shadow-xs">
            {room.type === 'open' ? (
              <Hash size={19} weight="bold" />
            ) : room.type === 'closed' ? (
              <LockKey size={19} weight="duotone" />
            ) : (
              <UsersThree size={19} weight="duotone" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-bold text-[15px] tracking-tight text-zinc-900 dark:text-white truncate">
                {room.display_name}
              </h2>
              <button
                type="button"
                onClick={() => runAction(onToggleStar, 'Failed to update star')}
                title={room.is_starred ? 'Unstar room' : 'Star room'}
                aria-label={room.is_starred ? 'Unstar room' : 'Star room'}
                className={`p-1 rounded-lg transition cursor-pointer ${
                  room.is_starred ? 'text-amber-400' : 'text-zinc-400 hover:text-amber-400'
                }`}
              >
                <Star size={14} weight={room.is_starred ? 'fill' : 'duotone'} />
              </button>
            </div>
            <button
              type="button"
              onClick={onOpenMembers}
              className="text-xs text-zinc-500 dark:text-violet-200/55 hover:text-violet-500 dark:hover:text-violet-300 truncate cursor-pointer text-left max-w-md block"
            >
              {room.members.length} {room.members.length === 1 ? 'member' : 'members'}
              {room.type === 'closed' ? ' · Private' : room.type === 'direct' ? ' · Direct message' : ' · Open'}
              {room.topic ? ` · ${room.topic}` : ''}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {room.disappear_seconds && (
            <span
              title={`Messages disappear after ${room.disappear_seconds}s`}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-500/15 border border-violet-400/25 text-violet-700 dark:text-violet-300 text-xs font-semibold"
            >
              <Timer size={14} weight="duotone" />
              {room.disappear_seconds < 3600
                ? `${Math.round(room.disappear_seconds / 60)}m`
                : `${Math.round(room.disappear_seconds / 3600)}h`}
            </span>
          )}
          <div className="flex items-center gap-0.5 rounded-full bg-white/70 dark:bg-white/[0.045] border border-violet-200/70 dark:border-white/[0.08] p-0.5">
            <button
              type="button"
              onClick={() => onStartCall(false)}
              title="Start Voice Call"
              aria-label="Start Voice Call"
              className="p-1.5 rounded-full text-zinc-500 hover:text-emerald-500 dark:text-zinc-400 dark:hover:text-emerald-400 hover:bg-violet-500/10 transition cursor-pointer"
            >
              <PhoneCall size={17} weight="duotone" />
            </button>
            <button
              type="button"
              onClick={() => onStartCall(true)}
              title="Start Video Call"
              aria-label="Start Video Call"
              className="p-1.5 rounded-full text-zinc-500 hover:text-violet-600 dark:text-zinc-400 dark:hover:text-violet-300 hover:bg-violet-500/10 transition cursor-pointer"
            >
              <VideoCamera size={17} weight="duotone" />
            </button>
          </div>
          <button
            type="button"
            onClick={onOpenShare}
            title="Share Room Link"
            aria-label="Share Room Link"
            className="p-2 rounded-xl text-zinc-500 hover:text-violet-600 dark:text-zinc-400 dark:hover:text-violet-300 hover:bg-violet-500/10 transition cursor-pointer"
          >
            <ShareNetwork size={18} weight="duotone" />
          </button>
          {pinnedMessages.length > 0 && (
            <button
              type="button"
              onClick={onTogglePinned}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-semibold transition cursor-pointer ${
                showPinned
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'glass-panel text-zinc-700 dark:text-zinc-200 hover:border-violet-400'
              }`}
            >
              <PushPin size={14} weight="duotone" />
              <span>{pinnedMessages.length}</span>
            </button>
          )}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full glass-panel">
            {room.involvement === 'nothing' ? (
              <BellSlash size={14} weight="duotone" className="text-zinc-400" />
            ) : (
              <BellRinging size={14} weight="duotone" className="text-violet-500 dark:text-violet-400" />
            )}
            <select
              value={room.involvement}
              onChange={(e) =>
                runAction(
                  () => onChangeInvolvement(e.target.value as Room['involvement']),
                  'Failed to update notification setting'
                )
              }
              title="Notification preference"
              aria-label="Notification preference"
              className="text-xs bg-transparent text-zinc-700 dark:text-zinc-200 focus:outline-none cursor-pointer [&>option]:bg-white [&>option]:text-zinc-900 dark:[&>option]:bg-[#131022] dark:[&>option]:text-zinc-100"
            >
              <option value="everything">All</option>
              <option value="mentions">@mentions</option>
              <option value="nothing">Muted</option>
            </select>
          </div>
          {room.type !== 'direct' && (
            <button
              type="button"
              onClick={onOpenRoomSettings}
              title="Room Settings"
              aria-label="Room Settings"
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-violet-500/10 transition cursor-pointer"
            >
              <SlidersHorizontal size={18} weight="duotone" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleDetails}
            title="Toggle Chat Details"
            aria-label="Toggle Chat Details"
            className={`flex p-2 rounded-xl transition cursor-pointer ${
              showDetails
                ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300'
                : 'text-zinc-500 dark:text-zinc-400 hover:bg-violet-500/10'
            }`}
          >
            <SidebarSimple size={18} weight="duotone" />
          </button>
        </div>
      </header>

      {actionError && (
        <div
          role="alert"
          className="px-4 sm:px-6 py-2 bg-rose-500/10 border-b border-rose-500/25 flex items-center justify-between gap-2 text-xs text-rose-600 dark:text-rose-300"
        >
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="p-1 cursor-pointer">
            <X size={13} weight="bold" />
          </button>
        </div>
      )}

      {!inCall && callParticipants.length > 0 && (
        <div className="px-4 sm:px-6 py-2.5 bg-emerald-500/10 border-b border-emerald-500/25 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {callParticipants.length} {callParticipants.length === 1 ? 'person is' : 'people are'} in a group call
            </span>
          </div>
          <button
            type="button"
            onClick={() => onStartCall(true)}
            className="px-3.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
          >
            Join Call
          </button>
        </div>
      )}

      {showPinned && (
        <div className="px-4 sm:px-6 py-3 bg-violet-500/10 border-b border-violet-500/20 space-y-2 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300">
            <span className="flex items-center gap-1.5">
              <PushPin size={14} weight="fill" />
              Pinned Messages ({pinnedMessages.length})
            </span>
            <button
              type="button"
              onClick={onClosePinned}
              aria-label="Close pinned messages"
              className="cursor-pointer hover:opacity-70"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
          {pinnedMessages.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              No pinned messages in this room yet. Hover any message and click the pin icon to pin it.
            </p>
          ) : (
            pinnedMessages.map((pm) => (
              <div
                key={pm.id}
                onClick={() => scrollToMessage(pm.id)}
                className="p-2.5 rounded-2xl glass-panel text-xs flex items-center justify-between gap-3 cursor-pointer hover:border-violet-400"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-zinc-900 dark:text-white">{pm.creator?.name}: </span>
                  <span className="text-zinc-600 dark:text-zinc-300 truncate">{pm.body || 'Attachment'}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    runAction(() => onTogglePin(pm.id), 'Failed to unpin message');
                  }}
                  className="text-zinc-400 hover:text-rose-500 shrink-0 cursor-pointer"
                  title="Unpin"
                >
                  <X size={13} weight="bold" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Message Feed with Smart Grouping */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        {hasMore && (
          <div className="text-center pb-3">
            <button
              type="button"
              onClick={onLoadMore}
              className="px-4 py-1.5 rounded-full text-xs font-semibold glass-panel text-zinc-600 dark:text-zinc-300 hover:border-violet-400 cursor-pointer transition"
            >
              Load older messages
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center py-16 text-zinc-400">
            <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-violet-600/20 to-purple-500/25 border border-violet-400/25 text-violet-500 dark:text-violet-300 flex items-center justify-center mb-3 shadow-lg shadow-violet-500/15">
              <Hash size={26} weight="duotone" />
            </div>
            <p className="font-bold text-zinc-800 dark:text-white">Welcome to {room.display_name}</p>
            <p className="text-xs text-zinc-500 dark:text-violet-200/55 mt-1 max-w-sm">
              Start chatting - supports markdown, code blocks, threads, voice notes, polls, @mentions, and /todo items.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const next = i < messages.length - 1 ? messages[i + 1] : null;
          const showDate =
            !prev || new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString();
          const groupedWithPrev = !showDate && canGroupMessages(prev, msg);
          const groupedWithNext = canGroupMessages(msg, next) && !next?.reply_to && !next?.is_pinned;

          return (
            <MessageItem
              key={msg.id}
              msg={msg}
              showDate={showDate}
              groupedWithPrev={groupedWithPrev}
              groupedWithNext={groupedWithNext}
              currentUser={currentUser}
              isEditing={editingId === msg.id}
              editDraft={editDraft}
              emojiMenuOpen={emojiMenuFor === msg.id}
              confirmDelete={confirmDeleteId === msg.id}
              onStartEdit={() => {
                setEditingId(msg.id);
                setEditDraft(msg.body);
              }}
              onChangeEditDraft={setEditDraft}
              onSaveEdit={() =>
                runAction(async () => {
                  await onEditMessage(msg.id, editDraft);
                  setEditingId(null);
                }, 'Failed to update message')
              }
              onCancelEdit={() => setEditingId(null)}
              onRequestDelete={() => setConfirmDeleteId(msg.id)}
              onConfirmDelete={() =>
                runAction(async () => {
                  await onDeleteMessage(msg.id);
                  setConfirmDeleteId(null);
                }, 'Failed to delete message')
              }
              onCancelDelete={() => setConfirmDeleteId(null)}
              onReply={() => {
                setReplyTo(msg);
                textareaRef.current?.focus();
              }}
              onOpenThread={onOpenThread}
              onInspectUser={onInspectUser}
              onPreviewImage={onPreviewImage}
              onScrollToMessage={scrollToMessage}
              onVotePoll={(id, optId) => runAction(() => onVotePoll(id, optId), 'Failed to vote')}
              onToggleBoost={(id, em) => {
                setEmojiMenuFor(null);
                runAction(() => onToggleBoost(id, em), 'Failed to react');
              }}
              onToggleEmojiMenu={() => setEmojiMenuFor(emojiMenuFor === msg.id ? null : msg.id)}
              onTogglePin={(id) => runAction(() => onTogglePin(id), 'Failed to update pin')}
              onToggleBookmark={(id) => runAction(() => onToggleBookmark(id), 'Failed to update bookmark')}
              onForward={onForwardMessage}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      {typingUsers.length > 0 && (
        <div className="px-6 pb-1 text-xs text-violet-400 italic">
          {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {/* Composer */}
      <div className="relative z-10 px-3 sm:px-5 pb-3 pt-2 border-t border-violet-200/60 dark:border-white/[0.07] bg-white/65 dark:bg-[#0B0815]/85 backdrop-blur-xl">
        {draft.startsWith('/') && !draft.includes(' ') && (
          <div className="absolute bottom-full left-4 mb-2 w-80 bg-white dark:bg-[#161228] border border-violet-200 dark:border-white/10 rounded-2xl shadow-xl p-1.5 z-20">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Slash Commands
            </div>
            {SLASH_COMMANDS.filter((c) => c.cmd.startsWith(draft.toLowerCase())).map((c) => (
              <button
                key={c.cmd}
                type="button"
                onClick={() => {
                  setDraft(c.fill);
                  textareaRef.current?.focus();
                }}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl hover:bg-violet-500/10 text-left text-xs cursor-pointer"
              >
                <span className="font-mono font-semibold text-violet-600 dark:text-violet-300">{c.cmd}</span>
                <span className="text-zinc-500 dark:text-zinc-400 truncate">{c.desc}</span>
              </button>
            ))}
          </div>
        )}

        {mentionUsers.length > 0 && (
          <div className="absolute bottom-full left-4 mb-2 w-64 bg-white dark:bg-[#161228] border border-violet-200 dark:border-white/10 rounded-2xl shadow-xl p-1.5 z-20">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Mention teammate
            </div>
            {mentionUsers.map((u) => (
              <button
                type="button"
                key={u.id}
                onClick={() => insertMention(u)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-violet-500/10 text-left text-sm text-zinc-800 dark:text-zinc-100 cursor-pointer"
              >
                <Avatar user={u} size="xs" />
                <span className="truncate font-medium">{u.name}</span>
              </button>
            ))}
          </div>
        )}

        {showComposerEmojis && (
          <div className="absolute bottom-full right-4 mb-2 bg-white dark:bg-[#161228] border border-violet-200 dark:border-white/10 rounded-2xl shadow-xl p-2 grid grid-cols-8 gap-1 z-20">
            {COMPOSER_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => {
                  setDraft((d) => d + em);
                  setShowComposerEmojis(false);
                  textareaRef.current?.focus();
                }}
                className="w-8 h-8 rounded-lg hover:bg-violet-500/15 flex items-center justify-center text-lg cursor-pointer"
              >
                {em}
              </button>
            ))}
          </div>
        )}

        {replyTo && (
          <div className="mb-2 flex items-center justify-between gap-2 px-3.5 py-2 rounded-2xl glass-panel border-l-2 border-l-violet-500 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <ArrowBendUpLeft size={14} weight="bold" className="text-violet-400 shrink-0" />
              <span className="font-semibold text-zinc-900 dark:text-white shrink-0">
                Replying to {replyTo.creator?.name}:
              </span>
              <span className="text-zinc-500 dark:text-zinc-400 truncate">{replyTo.body || 'Attachment'}</span>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
              className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2.5">
            {attachments.map((att) => (
              <div key={att.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel text-xs">
                <span className="truncate max-w-[160px] font-medium text-zinc-700 dark:text-zinc-200">
                  {att.filename}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                  aria-label={`Remove ${att.filename}`}
                  className="text-zinc-400 hover:text-rose-500 cursor-pointer"
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
            ))}
          </div>
        )}

        {scheduledMessages.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {scheduledMessages.map((sm) => (
              <div
                key={sm.id}
                className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-2xl glass-panel border-l-2 border-l-amber-400 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Clock size={14} weight="duotone" className="text-amber-400 shrink-0" />
                  <span className="text-amber-500 font-semibold shrink-0">
                    Scheduled {new Date(sm.send_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}:
                  </span>
                  <span className="truncate text-zinc-700 dark:text-zinc-200">{sm.body || 'Attachment'}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => runAction(() => onSendScheduledNow(sm.id), 'Failed to send scheduled message')}
                    className="px-2 py-0.5 rounded-full bg-violet-500/15 hover:bg-violet-500/25 text-violet-600 dark:text-violet-300 font-semibold cursor-pointer"
                  >
                    Send now
                  </button>
                  <button
                    type="button"
                    onClick={() => runAction(() => onCancelScheduled(sm.id), 'Failed to cancel scheduled message')}
                    aria-label="Cancel scheduled message"
                    className="text-zinc-400 hover:text-rose-500 cursor-pointer"
                  >
                    <X size={13} weight="bold" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showScheduleMenu && (
          <div className="absolute bottom-full right-4 mb-2 w-72 bg-white dark:bg-[#161228] border border-violet-200 dark:border-white/10 rounded-2xl shadow-xl p-3 space-y-2 z-20">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-200">
              <span className="flex items-center gap-1.5">
                <Clock size={14} weight="duotone" className="text-violet-500" />
                Schedule Send
              </span>
              <button type="button" onClick={() => setShowScheduleMenu(false)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer">
                <X size={13} weight="bold" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'In 15 mins', ms: 15 * 60 * 1000 },
                { label: 'In 1 hour', ms: 60 * 60 * 1000 },
                { label: 'In 3 hours', ms: 3 * 60 * 60 * 1000 },
                { label: 'Tomorrow 9am', ms: -1 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={async () => {
                    const target =
                      preset.ms === -1
                        ? (() => {
                            const d = new Date();
                            d.setDate(d.getDate() + 1);
                            d.setHours(9, 0, 0, 0);
                            return d;
                          })()
                        : new Date(Date.now() + preset.ms);
                    const text = draft.trim();
                    const files = attachments;
                    const replyId = replyTo?.id ?? null;
                    setShowScheduleMenu(false);
                    await runAction(async () => {
                      await onScheduleMessage(text, target.toISOString(), files, replyId);
                      setDraft('');
                      setAttachments([]);
                      setReplyTo(null);
                    }, 'Failed to schedule message');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-stone-100 dark:bg-white/[0.06] hover:bg-violet-500/15 text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 pt-1 border-t border-stone-200 dark:border-white/10">
              <input
                type="datetime-local"
                value={customSchedule}
                onChange={(e) => setCustomSchedule(e.target.value)}
                aria-label="Custom scheduled date and time"
                className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-[11px] text-zinc-900 dark:text-zinc-100"
              />
              <button
                type="button"
                disabled={!customSchedule}
                onClick={async () => {
                  const target = new Date(customSchedule);
                  if (Number.isNaN(target.getTime())) return;
                  const text = draft.trim();
                  const files = attachments;
                  const replyId = replyTo?.id ?? null;
                  setShowScheduleMenu(false);
                  await runAction(async () => {
                    await onScheduleMessage(text, target.toISOString(), files, replyId);
                    setDraft('');
                    setAttachments([]);
                    setReplyTo(null);
                    setCustomSchedule('');
                  }, 'Failed to schedule message');
                }}
                className="px-2.5 py-1 rounded-lg bg-violet-600 disabled:opacity-40 text-white text-[11px] font-semibold cursor-pointer"
              >
                Set
              </button>
            </div>
          </div>
        )}

        {showFormatBar && !recording && (
          <div className="mb-2 flex flex-wrap items-center gap-1 px-1">
            {[
              { label: 'Bold', prefix: '**', suffix: '**', placeholder: 'bold text', icon: <TextB size={14} weight="bold" /> },
              { label: 'Italic', prefix: '*', suffix: '*', placeholder: 'italic text', icon: <TextItalic size={14} /> },
              { label: 'Code', prefix: '`', suffix: '`', placeholder: 'code', icon: <Code size={14} /> },
              {
                label: 'Code Block',
                prefix: '```\n',
                suffix: '\n```',
                placeholder: 'code block',
                icon: <CodeBlock size={14} />,
              },
              { label: 'Quote', prefix: '> ', suffix: '', placeholder: 'quoted text', icon: <Quotes size={14} /> },
            ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => applyFormat(item.prefix, item.suffix, item.placeholder)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/80 dark:bg-white/[0.06] border border-violet-200/70 dark:border-white/[0.09] hover:border-violet-400 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
          </div>
        )}

        {recording ? (
          <div className="flex items-center justify-between gap-3 glass-panel rounded-[28px] px-4 py-2 border-rose-400/40">
            <div className="flex items-center gap-2.5 text-xs font-semibold text-rose-500">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <span>Recording Voice Note · {formatDuration(recordSeconds)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stopVoiceNote(true)}
                className="px-3 py-1.5 rounded-full bg-stone-200 dark:bg-white/10 text-xs font-semibold text-zinc-700 dark:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => stopVoiceNote(false)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-violet-600 to-purple-500 text-white text-xs font-semibold cursor-pointer"
              >
                <StopCircle size={15} weight="fill" />
                Send Note
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-1.5 glass-panel rounded-[28px] px-3 py-1.5 focus-within:ring-2 focus-within:ring-violet-500/40 transition"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Attach file"
              aria-label="Attach file"
              className="p-2 rounded-full text-zinc-500 hover:text-violet-500 hover:bg-violet-500/10 transition cursor-pointer"
            >
              <Paperclip size={18} weight="bold" />
            </button>
            <button
              type="button"
              onClick={onOpenCreatePoll}
              title="Create Poll"
              aria-label="Create Poll"
              className="p-2 rounded-full text-zinc-500 hover:text-violet-500 hover:bg-violet-500/10 transition cursor-pointer"
            >
              <ChartBar size={18} weight="duotone" />
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
                  e.preventDefault();
                  applyFormat('**', '**', 'bold text');
                  return;
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
                  e.preventDefault();
                  applyFormat('*', '*', 'italic text');
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={
                uploading
                  ? 'Uploading file...'
                  : `Message ${room.type === 'direct' ? room.display_name : '#' + room.display_name} (try /todo or /help)`
              }
              className="flex-1 bg-transparent resize-none py-2 px-1.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none max-h-32"
            />

            <button
              type="button"
              onClick={() => setShowFormatBar((s) => !s)}
              title="Formatting options (Ctrl+B, Ctrl+I)"
              aria-label="Formatting options"
              aria-pressed={showFormatBar}
              className={`p-2 rounded-full transition cursor-pointer ${
                showFormatBar
                  ? 'text-violet-600 dark:text-violet-300 bg-violet-500/15'
                  : 'text-zinc-500 hover:text-violet-500 hover:bg-violet-500/10'
              }`}
            >
              <TextAa size={18} weight="duotone" />
            </button>

            <button
              type="button"
              onClick={() => setShowComposerEmojis((s) => !s)}
              title="Insert emoji"
              aria-label="Insert emoji"
              className="p-2 rounded-full text-zinc-500 hover:text-violet-500 hover:bg-violet-500/10 transition cursor-pointer"
            >
              <SmileyWink size={18} weight="duotone" />
            </button>

            {!draft.trim() && attachments.length === 0 ? (
              <button
                type="button"
                onClick={startVoiceNote}
                disabled={uploading}
                title="Record voice note"
                aria-label="Record voice note"
                className="p-2.5 rounded-full bg-violet-500/15 hover:bg-violet-500/25 text-violet-600 dark:text-violet-300 transition cursor-pointer"
              >
                <Microphone size={16} weight="duotone" />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowScheduleMenu((s) => !s)}
                  disabled={sending || uploading}
                  title="Schedule send"
                  aria-label="Schedule send"
                  className="p-2 rounded-full text-zinc-500 hover:text-violet-500 hover:bg-violet-500/10 transition cursor-pointer"
                >
                  <Clock size={17} weight="duotone" />
                </button>
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.92 }}
                  disabled={sending || uploading}
                  aria-label="Send message"
                  className="p-2.5 rounded-full bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 disabled:opacity-35 text-white shadow-md shadow-violet-600/30 transition cursor-pointer"
                >
                  <PaperPlaneTilt size={16} weight="fill" />
                </motion.button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

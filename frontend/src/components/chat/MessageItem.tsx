import { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowBendUpLeft,
  ArrowSquareOut,
  BookmarkSimple,
  ChartBar,
  ChatText,
  Check,
  Copy,
  DownloadSimple,
  FileText,
  PencilSimple,
  PushPin,
  SmileyWink,
  Trash,
  X,
} from '@phosphor-icons/react';
import type { Message, User } from '../../types';
import { safeHostname } from '../../utils/url';
import { Avatar } from '../Avatar';
import { SpotlightCard } from '../ui/SpotlightCard';

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '👀', '🚀', '💯'];

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeader(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderInlineMarkdown(text: string, currentUserName: string, isMine: boolean) {
  const tokenRegex =
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|https?:\/\/[^\s]+|@[A-Za-z0-9_.-]+(?:\s[A-Za-z0-9_.-]+)?)/g;
  const parts = text.split(tokenRegex);
  return parts.map((part, idx) => {
    if (!part) return null;
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className={`px-1.5 py-0.5 rounded-md font-mono text-[13px] ${
            isMine
              ? 'bg-black/25 text-white'
              : 'bg-violet-100 dark:bg-white/10 text-violet-700 dark:text-violet-300'
          }`}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={idx} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      return (
        <del key={idx} className="line-through opacity-70">
          {part.slice(2, -2)}
        </del>
      );
    }
    if (part.startsWith('http://') || part.startsWith('https://')) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={`hover:underline break-all ${
            isMine ? 'text-violet-100 underline' : 'text-violet-600 dark:text-violet-300'
          }`}
        >
          {part}
        </a>
      );
    }
    if (part.startsWith('@')) {
      const isMe = part.slice(1).toLowerCase() === currentUserName.toLowerCase();
      return (
        <span
          key={idx}
          className={`inline-block px-1.5 py-0.5 rounded-md text-[13px] font-semibold ${
            isMine
              ? 'bg-white/20 text-white'
              : isMe
              ? 'bg-amber-400/20 text-amber-700 dark:text-amber-300 ring-1 ring-amber-400/40'
              : 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
          }`}
        >
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function RichMessageBody({
  body,
  currentUserName,
  isMine,
}: {
  body: string;
  currentUserName: string;
  isMine: boolean;
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const blocks = body.split(/(```[\s\S]*?```)/g);

  return (
    <div className="text-[14px] leading-relaxed whitespace-pre-wrap break-words space-y-2">
      {blocks.map((block, idx) => {
        if (block.startsWith('```') && block.endsWith('```') && block.length >= 6) {
          const inner = block.slice(3, -3).replace(/^\w*\n/, '');
          return (
            <div
              key={idx}
              className="relative group/code rounded-2xl bg-[#0B0814] text-zinc-100 border border-white/10 p-3.5 font-mono text-[13px] overflow-x-auto"
            >
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(inner);
                  setCopiedIdx(idx);
                  setTimeout(() => setCopiedIdx(null), 1500);
                }}
                className="absolute right-2.5 top-2.5 p-1.5 rounded-lg bg-white/10 text-zinc-300 hover:text-white opacity-0 group-hover/code:opacity-100 transition cursor-pointer"
                title="Copy code"
              >
                {copiedIdx === idx ? <Check size={14} weight="bold" /> : <Copy size={14} weight="duotone" />}
              </button>
              <pre className="m-0">{inner}</pre>
            </div>
          );
        }
        return <span key={idx}>{renderInlineMarkdown(block, currentUserName, isMine)}</span>;
      })}
    </div>
  );
}

interface MessageItemProps {
  msg: Message;
  showDate: boolean;
  groupedWithPrev: boolean;
  groupedWithNext: boolean;
  currentUser: User;
  isEditing: boolean;
  editDraft: string;
  emojiMenuOpen: boolean;
  confirmDelete: boolean;
  onStartEdit: () => void;
  onChangeEditDraft: (val: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onReply: () => void;
  onOpenThread: (messageId: number) => void;
  onInspectUser: (user: User) => void;
  onPreviewImage: (img: { url: string; filename: string }) => void;
  onScrollToMessage: (id: number) => void;
  onVotePoll: (messageId: number, optionId: number) => void;
  onToggleBoost: (messageId: number, emoji: string) => void;
  onToggleEmojiMenu: () => void;
  onTogglePin: (messageId: number) => void;
  onToggleBookmark: (messageId: number) => void;
}

export function MessageItem({
  msg,
  showDate,
  groupedWithPrev,
  groupedWithNext,
  currentUser,
  isEditing,
  editDraft,
  emojiMenuOpen,
  confirmDelete,
  onStartEdit,
  onChangeEditDraft,
  onSaveEdit,
  onCancelEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onReply,
  onOpenThread,
  onInspectUser,
  onPreviewImage,
  onScrollToMessage,
  onVotePoll,
  onToggleBoost,
  onToggleEmojiMenu,
  onTogglePin,
  onToggleBookmark,
}: MessageItemProps) {
  const isMine = msg.creator?.id === currentUser.id;
  const canModify = isMine || currentUser.role === 'administrator';
  const bookmarked = Boolean(msg.is_bookmarked);
  const compactHeader = groupedWithPrev && !msg.reply_to && !msg.is_pinned;
  const repliesCount = msg.replies_count ?? 0;

  const bubbleRadius = isMine
    ? groupedWithNext
      ? 'rounded-3xl rounded-br-xl'
      : 'rounded-3xl rounded-br-md'
    : groupedWithNext
    ? 'rounded-3xl rounded-bl-xl'
    : 'rounded-3xl rounded-bl-md';

  const renderAvatarTrigger = (positionMine: boolean) => {
    if (!positionMine && groupedWithNext) return <div className="w-8 shrink-0" />;
    if (positionMine && groupedWithNext) return <div className="w-8 shrink-0" />;
    if (!msg.creator) return <Avatar user={null} size="sm" />;
    return (
      <button
        type="button"
        onClick={() => onInspectUser(msg.creator!)}
        aria-label={`View ${msg.creator.name}'s profile`}
        className="rounded-xl hover:ring-2 hover:ring-violet-400/50 transition cursor-pointer shrink-0"
      >
        <Avatar user={msg.creator} size="sm" />
      </button>
    );
  };

  return (
    <div className={compactHeader ? 'mt-0.5' : 'mt-3 first:mt-0'}>
      {showDate && (
        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-violet-200/60 dark:bg-white/[0.07]" />
          <span className="px-3 py-0.5 rounded-full bg-white/70 dark:bg-white/[0.05] border border-violet-200/60 dark:border-white/[0.08] text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-violet-200/50">
            {formatDateHeader(msg.created_at)}
          </span>
          <div className="h-px flex-1 bg-violet-200/60 dark:bg-white/[0.07]" />
        </div>
      )}

      <motion.div
        id={`msg-${msg.id}`}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.14 }}
        className={`group relative flex items-end gap-2.5 ${isMine ? 'justify-end' : 'justify-start'}`}
      >
        {!isMine && renderAvatarTrigger(false)}

        <div
          className={`relative max-w-[82%] sm:max-w-[70%] ${bubbleRadius} px-4 py-2.5 transition ${
            isMine
              ? 'bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 text-white shadow-lg shadow-violet-700/25 border border-white/15'
              : 'glass-panel text-zinc-900 dark:text-zinc-100'
          } ${msg.is_pinned ? 'ring-1 ring-amber-400/70' : ''}`}
        >
          {!compactHeader && (
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-1.5">
                {msg.creator ? (
                  <button
                    type="button"
                    onClick={() => onInspectUser(msg.creator!)}
                    className={`text-xs font-bold hover:underline cursor-pointer ${
                      isMine ? 'text-violet-100' : 'text-violet-700 dark:text-violet-300'
                    }`}
                  >
                    {msg.creator.name}
                  </button>
                ) : (
                  <span className="text-xs font-bold text-zinc-400">Unknown</span>
                )}
                {msg.creator?.status_emoji && (
                  <span title={msg.creator.status_text || ''} className="text-xs">
                    {msg.creator.status_emoji}
                  </span>
                )}
                {msg.is_pinned && (
                  <PushPin size={11} weight="fill" className={isMine ? 'text-amber-300' : 'text-violet-400'} />
                )}
              </div>
              <span
                className={`text-[10px] font-mono ${
                  isMine ? 'text-violet-200/75' : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                {formatTime(msg.created_at)}
              </span>
            </div>
          )}

          {msg.reply_to && (
            <button
              type="button"
              onClick={() => onScrollToMessage(msg.reply_to!.id)}
              className={`mb-2 flex items-center gap-2 px-2.5 py-1.5 rounded-xl border-l-2 text-xs text-left w-full transition cursor-pointer ${
                isMine
                  ? 'bg-black/20 border-violet-200 text-violet-100'
                  : 'bg-violet-500/10 border-violet-500 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              <ArrowBendUpLeft size={12} weight="bold" className="shrink-0" />
              <span className="font-semibold shrink-0">{msg.reply_to.creator_name}:</span>
              <span className="truncate opacity-80">{msg.reply_to.body}</span>
            </button>
          )}

          {isEditing ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                value={editDraft}
                onChange={(e) => onChangeEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSaveEdit();
                  } else if (e.key === 'Escape') {
                    onCancelEdit();
                  }
                }}
                autoFocus
                className="flex-1 px-3 py-1.5 rounded-xl bg-black/20 border border-white/20 text-sm text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={onSaveEdit}
                aria-label="Save edit"
                className="p-1.5 rounded-lg bg-white/20 text-white cursor-pointer"
              >
                <Check size={14} weight="bold" />
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                aria-label="Cancel edit"
                className="p-1.5 rounded-lg bg-black/20 text-white/80 cursor-pointer"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          ) : (
            msg.body && <RichMessageBody body={msg.body} currentUserName={currentUser.name} isMine={isMine} />
          )}

          {compactHeader && (
            <div
              className={`mt-1 text-right text-[9.5px] font-mono opacity-60 ${
                isMine ? 'text-violet-100' : 'text-zinc-400'
              }`}
            >
              {formatTime(msg.created_at)}
            </div>
          )}

          {msg.poll && (
            <div className="mt-2 p-3 rounded-2xl bg-black/15 border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold">
                <ChartBar size={16} weight="duotone" />
                <span>{msg.poll.question}</span>
              </div>
              {(() => {
                const totalVotes = msg.poll.options.reduce((sum, o) => sum + o.votes.length, 0);
                return (
                  <div className="space-y-1.5">
                    {msg.poll.options.map((opt) => {
                      const count = opt.votes.length;
                      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                      const voted = opt.votes.includes(currentUser.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onVotePoll(msg.id, opt.id)}
                          className={`relative w-full text-left px-3 py-2 rounded-xl border overflow-hidden transition cursor-pointer ${
                            voted
                              ? 'border-white/50 bg-white/15'
                              : 'border-white/15 bg-black/15 hover:border-white/30'
                          }`}
                        >
                          <div
                            className="absolute inset-y-0 left-0 bg-white/20 transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                          <div className="relative z-10 flex items-center justify-between text-xs font-medium">
                            <span className="flex items-center gap-1.5">
                              {voted && <Check size={13} weight="bold" />}
                              {opt.text}
                            </span>
                            <span className="font-mono opacity-80">
                              {count} ({pct}%)
                            </span>
                          </div>
                        </button>
                      );
                    })}
                    <div className="text-[11px] opacity-70 pt-0.5 font-mono">
                      {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {msg.attachments && msg.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {msg.attachments.map((att) => {
                const isImg = att.content_type.startsWith('image/');
                const isVideo = att.content_type.startsWith('video/');
                const isAudio = att.content_type.startsWith('audio/');
                if (isImg) {
                  return (
                    <button
                      type="button"
                      key={att.id}
                      onClick={() => onPreviewImage({ url: att.url, filename: att.filename })}
                      className="block text-left cursor-pointer"
                    >
                      <img
                        src={att.url}
                        alt={att.filename}
                        className="max-h-60 max-w-xs rounded-2xl border border-white/15 shadow-sm object-cover hover:opacity-95 transition"
                      />
                    </button>
                  );
                }
                if (isVideo) {
                  return (
                    <video
                      key={att.id}
                      src={att.url}
                      controls
                      className="max-h-60 max-w-xs rounded-2xl border border-white/15"
                    />
                  );
                }
                if (isAudio) {
                  return (
                    <div
                      key={att.id}
                      className="flex flex-col gap-1 px-3 py-2 rounded-2xl bg-black/20 border border-white/15"
                    >
                      <span className="text-[10px] font-medium opacity-80">
                        Voice Note · {formatBytes(att.byte_size)}
                      </span>
                      <audio src={att.url} controls className="max-w-[230px] h-8" />
                    </div>
                  );
                }
                return (
                  <a
                    key={att.id}
                    href={att.url}
                    download={att.filename}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-black/20 border border-white/15 hover:border-white/30 transition"
                  >
                    <FileText size={18} weight="duotone" className="shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate max-w-[160px]">{att.filename}</div>
                      <div className="text-[10px] opacity-70 font-mono">{formatBytes(att.byte_size)}</div>
                    </div>
                    <DownloadSimple size={15} weight="bold" />
                  </a>
                );
              })}
            </div>
          )}

          {msg.unfurl && msg.unfurl.title && (
            <a href={msg.unfurl.url} target="_blank" rel="noopener noreferrer" className="block mt-2">
              <SpotlightCard className="p-2.5 rounded-2xl bg-black/20 border border-white/15">
                <div className="flex gap-2.5">
                  {msg.unfurl.image && (
                    <img src={msg.unfurl.image} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold opacity-80 flex items-center gap-1">
                      {msg.unfurl.site_name || safeHostname(msg.unfurl.url)}
                      <ArrowSquareOut size={11} weight="bold" />
                    </div>
                    <div className="text-xs font-semibold truncate">{msg.unfurl.title}</div>
                    {msg.unfurl.description && (
                      <div className="text-[11px] opacity-75 line-clamp-2 mt-0.5">{msg.unfurl.description}</div>
                    )}
                  </div>
                </div>
              </SpotlightCard>
            </a>
          )}

          {msg.boosts && msg.boosts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {msg.boosts.map((b) => (
                <button
                  type="button"
                  key={b.content}
                  onClick={() => onToggleBoost(msg.id, b.content)}
                  title={b.user_names.join(', ')}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition cursor-pointer ${
                    b.me
                      ? 'bg-violet-500/25 border-violet-300/50 text-white'
                      : isMine
                      ? 'bg-black/20 border-white/20 text-white'
                      : 'bg-white/70 dark:bg-white/[0.06] border-violet-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200'
                  }`}
                >
                  <span>{b.content}</span>
                  <span className="font-mono text-[10px]">{b.count}</span>
                </button>
              ))}
            </div>
          )}

          {repliesCount > 0 && (
            <button
              type="button"
              onClick={() => onOpenThread(msg.id)}
              className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                isMine
                  ? 'bg-white/15 hover:bg-white/25 text-white'
                  : 'bg-violet-500/12 hover:bg-violet-500/20 text-violet-700 dark:text-violet-300'
              }`}
            >
              <ChatText size={13} weight="duotone" />
              <span>
                {repliesCount} {repliesCount === 1 ? 'reply' : 'replies'}
              </span>
            </button>
          )}

          <div
            className={`opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition flex items-center gap-0.5 bg-white dark:bg-[#161228] border border-violet-200 dark:border-white/15 rounded-full shadow-xl px-1.5 py-0.5 absolute -top-3.5 z-20 ${
              isMine ? 'left-2' : 'right-2'
            }`}
          >
            <button
              type="button"
              onClick={onReply}
              title="Reply inline"
              aria-label="Reply inline"
              className="p-1.5 rounded-full text-zinc-500 hover:text-violet-500 hover:bg-violet-500/10 cursor-pointer"
            >
              <ArrowBendUpLeft size={14} weight="duotone" />
            </button>
            <button
              type="button"
              onClick={() => onOpenThread(msg.id)}
              title="Open thread"
              aria-label="Open thread"
              className="p-1.5 rounded-full text-zinc-500 hover:text-violet-500 hover:bg-violet-500/10 cursor-pointer"
            >
              <ChatText size={14} weight="duotone" />
            </button>
            <button
              type="button"
              onClick={() => onToggleBookmark(msg.id)}
              title={bookmarked ? 'Remove bookmark' : 'Bookmark message'}
              aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark message'}
              className={`p-1.5 rounded-full hover:bg-violet-500/10 cursor-pointer ${
                bookmarked ? 'text-violet-500' : 'text-zinc-500 hover:text-violet-500'
              }`}
            >
              <BookmarkSimple size={14} weight={bookmarked ? 'fill' : 'duotone'} />
            </button>
            <button
              type="button"
              onClick={() => onTogglePin(msg.id)}
              title={msg.is_pinned ? 'Unpin' : 'Pin message'}
              aria-label={msg.is_pinned ? 'Unpin' : 'Pin message'}
              className={`p-1.5 rounded-full hover:bg-violet-500/10 cursor-pointer ${
                msg.is_pinned ? 'text-violet-500' : 'text-zinc-500 hover:text-violet-500'
              }`}
            >
              <PushPin size={14} weight={msg.is_pinned ? 'fill' : 'duotone'} />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={onToggleEmojiMenu}
                title="React"
                aria-label="React"
                className="p-1.5 rounded-full text-zinc-500 hover:text-violet-500 hover:bg-violet-500/10 cursor-pointer"
              >
                <SmileyWink size={14} weight="duotone" />
              </button>
              {emojiMenuOpen && (
                <div className="absolute right-0 top-8 bg-white dark:bg-[#161228] border border-violet-200 dark:border-white/10 rounded-2xl shadow-xl p-1.5 flex gap-1 z-30">
                  {QUICK_EMOJIS.map((em) => (
                    <button
                      type="button"
                      key={em}
                      onClick={() => onToggleBoost(msg.id, em)}
                      className="w-7 h-7 rounded-lg hover:bg-violet-500/15 flex items-center justify-center text-base cursor-pointer"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {canModify && (
              <>
                <button
                  type="button"
                  onClick={onStartEdit}
                  title="Edit"
                  aria-label="Edit"
                  className="p-1.5 rounded-full text-zinc-500 hover:text-violet-500 hover:bg-violet-500/10 cursor-pointer"
                >
                  <PencilSimple size={14} weight="duotone" />
                </button>
                {confirmDelete ? (
                  <div className="flex items-center gap-1 pl-1">
                    <button
                      type="button"
                      onClick={onConfirmDelete}
                      className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-semibold cursor-pointer"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={onCancelDelete}
                      aria-label="Cancel delete"
                      className="p-1 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
                    >
                      <X size={12} weight="bold" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onRequestDelete}
                    title="Delete"
                    aria-label="Delete"
                    className="p-1.5 rounded-full text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                  >
                    <Trash size={14} weight="duotone" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {isMine && renderAvatarTrigger(true)}
      </motion.div>
    </div>
  );
}

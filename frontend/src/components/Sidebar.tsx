import { useState } from 'react';
import { motion } from 'motion/react';
import {
  At,
  BookmarkSimple,
  ChatsCircle,
  ChatsTeardrop,
  Check,
  GearSix,
  Hash,
  LinkSimple,
  LockKey,
  MagnifyingGlass,
  MoonStars,
  Plus,
  SignOut,
  Star,
  SunDim,
  Timer,
  UsersThree,
  X,
} from '@phosphor-icons/react';
import type { Account, Room, User } from '../types';
import { Avatar } from './Avatar';

interface SidebarProps {
  account: Account;
  currentUser: User;
  rooms: Room[];
  activeRoomId: number | null;
  onlineUserIds: number[];
  darkMode: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelectRoom: (roomId: number) => void;
  onOpenNewRoom: () => void;
  onOpenNewDM: () => void;
  onOpenSearch: () => void;
  onOpenMentions: () => void;
  onOpenBookmarks: () => void;
  onOpenProfile: () => void;
  onOpenAdmin: () => void;
  onToggleTheme: () => void;
  onMarkAllRead: () => Promise<void>;
  onLogout: () => void;
}

type FilterTab = 'all' | 'rooms' | 'private' | 'direct';

export function Sidebar({
  account,
  currentUser,
  rooms,
  activeRoomId,
  onlineUserIds,
  darkMode,
  mobileOpen,
  onCloseMobile,
  onSelectRoom,
  onOpenNewRoom,
  onOpenNewDM,
  onOpenSearch,
  onOpenMentions,
  onOpenBookmarks,
  onOpenProfile,
  onOpenAdmin,
  onToggleTheme,
  onMarkAllRead,
  onLogout,
}: SidebarProps) {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [roomQuery, setRoomQuery] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const unreadTotal = rooms.filter((r) => r.unread && r.id !== activeRoomId).length;
  const unreadMessagesTotal = rooms.reduce(
    (sum, r) => sum + (r.unread && r.id !== activeRoomId ? Math.max(1, r.unread_count ?? 1) : 0),
    0
  );

  const filteredRooms = rooms.filter((r) => {
    if (filter === 'rooms' && r.type !== 'open') return false;
    if (filter === 'private' && r.type !== 'closed') return false;
    if (filter === 'direct' && r.type !== 'direct') return false;
    if (roomQuery.trim()) {
      return r.display_name.toLowerCase().includes(roomQuery.trim().toLowerCase());
    }
    return true;
  });

  const starredRooms = filteredRooms.filter((r) => r.is_starred);
  const regularRooms = filter === 'all' && starredRooms.length > 0 ? filteredRooms.filter((r) => !r.is_starred) : filteredRooms;

  const copyInvite = () => {
    const url = `${window.location.origin}/?join=${account.join_code}`;
    navigator.clipboard.writeText(url);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 1800);
  };

  const renderRoomItem = (room: Room) => {
    const isActive = room.id === activeRoomId;
    const otherUser =
      room.type === 'direct' ? room.members.find((m) => m.id !== currentUser.id) || room.members[0] : null;
    const otherOnline = !!otherUser && onlineUserIds.includes(otherUser.id);

    return (
      <button
        type="button"
        key={room.id}
        onClick={() => {
          onSelectRoom(room.id);
          onCloseMobile();
        }}
        className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition cursor-pointer ${
          isActive
            ? 'text-zinc-950 dark:text-white'
            : 'text-zinc-600 dark:text-zinc-300 hover:bg-violet-500/8 dark:hover:bg-white/[0.045]'
        }`}
      >
        {isActive && (
          <motion.div
            layoutId="active-room-card"
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="absolute inset-0 rounded-2xl glass-panel border-violet-300/70 dark:border-violet-400/25 shadow-sm"
          />
        )}
        <div className="relative z-10 flex items-center gap-3 w-full min-w-0">
          {room.type === 'direct' ? (
            <Avatar user={otherUser} size="sm" online={otherOnline} />
          ) : (
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition ${
                isActive
                  ? 'bg-gradient-to-br from-violet-600 to-purple-500 text-white shadow-md shadow-violet-600/35'
                  : 'bg-violet-500/12 text-violet-600 dark:text-violet-300 border border-violet-400/15'
              }`}
            >
              {room.type === 'closed' ? <LockKey size={15} weight="duotone" /> : <Hash size={15} weight="bold" />}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1.5">
              <span className={`text-[13.5px] truncate ${isActive || room.unread ? 'font-bold' : 'font-semibold'}`}>
                {room.display_name}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {room.is_starred && <Star size={11} weight="fill" className="text-amber-400" />}
                {room.disappear_seconds && (
                  <span title="Disappearing messages active">
                    <Timer size={12} weight="duotone" className="text-violet-400" />
                  </span>
                )}
                {room.unread && !isActive && (
                  <span className="min-w-4 h-4 px-1.5 rounded-full bg-violet-600 text-[9px] font-bold text-white shadow-xs shadow-violet-600/50 flex items-center justify-center">
                    {room.unread_count && room.unread_count > 0
                      ? room.unread_count > 99
                        ? '99+'
                        : room.unread_count
                      : 'New'}
                  </span>
                )}
              </div>
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-violet-200/50 truncate">
              {room.topic
                ? room.topic
                : room.type === 'direct'
                ? otherOnline
                  ? 'Online now'
                  : 'Direct message'
                : `${room.members.length} ${room.members.length === 1 ? 'member' : 'members'} · ${
                    room.type === 'closed' ? 'Private' : 'Open'
                  }`}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const navItems: { id: FilterTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: 'all',
      label: 'All chats',
      icon: <ChatsTeardrop size={20} weight="duotone" />,
      badge: unreadMessagesTotal > 0 ? unreadMessagesTotal : undefined,
    },
    { id: 'rooms', label: 'Rooms', icon: <Hash size={20} weight="bold" /> },
    { id: 'private', label: 'Private', icon: <LockKey size={20} weight="duotone" /> },
    { id: 'direct', label: 'Direct', icon: <UsersThree size={20} weight="duotone" /> },
  ];

  const filterTitle: Record<FilterTab, string> = {
    all: 'All Conversations',
    rooms: 'Open Rooms',
    private: 'Private Vaults',
    direct: 'Direct Messages',
  };

  const shell = (
    <div className="h-full flex bg-[#F4F2FA] dark:bg-[#0B0814] border-r border-violet-200/70 dark:border-white/[0.08] select-none">
      {/* Far-Left Vertical Navigation Rail */}
      <nav
        aria-label="Workspace filter rail"
        className="w-[68px] shrink-0 flex flex-col items-center justify-between py-4 border-r border-violet-200/60 dark:border-white/[0.06] bg-white/75 dark:bg-[#07050E]"
      >
        <div className="flex flex-col items-center gap-2.5 w-full px-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-violet-600/35 mb-2 ring-1 ring-white/20">
            {account.logo_url ? (
              <img src={account.logo_url} alt={account.name} className="w-10 h-10 rounded-2xl object-cover" />
            ) : (
              <ChatsTeardrop size={21} weight="duotone" />
            )}
          </div>

          {navItems.map((item) => {
            const active = filter === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setFilter(item.id)}
                title={item.label}
                aria-label={item.label}
                aria-pressed={active}
                className={`relative w-full py-2 rounded-2xl flex flex-col items-center gap-0.5 transition cursor-pointer ${
                  active
                    ? 'bg-violet-600/15 dark:bg-violet-500/20 text-violet-700 dark:text-violet-200 shadow-xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-violet-500/8'
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-violet-500"
                  />
                )}
                {item.badge !== undefined && (
                  <span className="absolute top-1 right-1.5 min-w-4 h-4 px-1 rounded-full bg-violet-600 text-white text-[9px] font-bold flex items-center justify-center shadow">
                    {item.badge}
                  </span>
                )}
                {item.icon}
                <span className="text-[9.5px] font-semibold leading-tight">{item.label.split(' ')[0]}</span>
              </button>
            );
          })}

          <div className="w-8 h-px bg-violet-200/70 dark:bg-white/[0.07] my-0.5" />

          <button
            type="button"
            onClick={() => {
              onOpenMentions();
              onCloseMobile();
            }}
            title="Mentions & Replies"
            aria-label="Mentions & Replies"
            className="w-full py-2 rounded-2xl flex flex-col items-center gap-0.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-violet-500/8 transition cursor-pointer"
          >
            <At size={20} weight="duotone" />
            <span className="text-[9.5px] font-semibold">Mentions</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenBookmarks();
              onCloseMobile();
            }}
            title="Saved Bookmarks"
            aria-label="Saved Bookmarks"
            className="w-full py-2 rounded-2xl flex flex-col items-center gap-0.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-violet-500/8 transition cursor-pointer"
          >
            <BookmarkSimple size={20} weight="duotone" />
            <span className="text-[9.5px] font-semibold">Saved</span>
          </button>
        </div>

        <div className="flex flex-col items-center gap-2 px-2 w-full">
          <button
            type="button"
            onClick={onToggleTheme}
            title={darkMode ? 'Switch to Light mode' : 'Switch to Dark mode'}
            aria-label={darkMode ? 'Switch to Light mode' : 'Switch to Dark mode'}
            className="p-2.5 rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-violet-500 hover:bg-violet-500/10 transition cursor-pointer"
          >
            {darkMode ? <SunDim size={19} weight="duotone" /> : <MoonStars size={19} weight="duotone" />}
          </button>
          {currentUser.role === 'administrator' && (
            <button
              type="button"
              onClick={onOpenAdmin}
              title="Workspace Administration"
              aria-label="Workspace Administration"
              className="p-2.5 rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-violet-500 hover:bg-violet-500/10 transition cursor-pointer"
            >
              <GearSix size={19} weight="duotone" />
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            title="Sign out"
            aria-label="Sign out"
            className="p-2.5 rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
          >
            <SignOut size={19} weight="duotone" />
          </button>
        </div>
      </nav>

      {/* Conversation List Column */}
      <aside className="w-72 flex flex-col h-full bg-[#F6F4FB] dark:bg-[#0D0A18]">
        {/* Workspace & Profile Header */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-bold text-[16px] tracking-tight text-zinc-900 dark:text-white truncate">
              {account.name}
            </h1>
            <p className="text-[11px] text-zinc-500 dark:text-violet-200/55 truncate">
              {currentUser.status_emoji || currentUser.status_text
                ? `${currentUser.status_emoji || ''} ${currentUser.status_text || ''}`.trim()
                : `${onlineUserIds.length || 1} active now`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenProfile}
              title="Your Profile"
              aria-label="Your Profile"
              className="rounded-xl hover:ring-2 hover:ring-violet-500/50 transition cursor-pointer"
            >
              <Avatar user={currentUser} size="sm" online />
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close sidebar"
              className="md:hidden p-1.5 rounded-lg text-zinc-500 hover:bg-white/10"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>

        {/* Filter Conversations + Global Search */}
        <div className="px-3 pb-3 flex items-center gap-1.5">
          <div className="relative flex-1">
            <MagnifyingGlass
              size={14}
              weight="duotone"
              className="text-violet-500 dark:text-violet-400 absolute left-3 top-2.5 pointer-events-none"
            />
            <input
              type="search"
              enterKeyHint="search"
              value={roomQuery}
              onChange={(e) => setRoomQuery(e.target.value)}
              placeholder="Filter rooms..."
              aria-label="Filter rooms"
              className="w-full pl-8 pr-2.5 py-2 rounded-2xl bg-white/85 dark:bg-white/[0.045] border border-violet-200/70 dark:border-white/[0.09] text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-violet-400"
            />
          </div>
          <button
            type="button"
            onClick={onOpenSearch}
            title="Full-text message search (Ctrl+K)"
            aria-label="Full-text message search"
            className="px-2.5 py-2 rounded-2xl bg-white/85 dark:bg-white/[0.045] border border-violet-200/70 dark:border-white/[0.09] hover:border-violet-400 text-[10px] font-mono font-semibold text-violet-700 dark:text-violet-300 transition cursor-pointer shrink-0"
          >
            Ctrl K
          </button>
        </div>

        <div className="px-3 pb-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              onOpenNewRoom();
              onCloseMobile();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 text-white text-xs font-semibold shadow-md shadow-violet-600/25 transition cursor-pointer"
          >
            <Plus size={14} weight="bold" />
            New Group
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenNewDM();
              onCloseMobile();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full glass-panel hover:border-violet-400 text-zinc-800 dark:text-zinc-100 text-xs font-semibold transition cursor-pointer"
          >
            <ChatsCircle size={14} weight="duotone" className="text-violet-500 dark:text-violet-400" />
            New Chat
          </button>
          <button
            type="button"
            onClick={copyInvite}
            title="Copy Workspace Invite Link"
            aria-label="Copy Workspace Invite Link"
            className="p-2 rounded-full bg-violet-500/12 hover:bg-violet-500/20 text-violet-600 dark:text-violet-300 transition cursor-pointer"
          >
            {copiedInvite ? <Check size={15} weight="bold" /> : <LinkSimple size={15} weight="bold" />}
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2.5 pb-4 space-y-3">
          {filter === 'all' && starredRooms.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wider text-amber-500/90">
                <span className="flex items-center gap-1">
                  <Star size={11} weight="fill" />
                  Starred
                </span>
                <span className="font-mono text-zinc-400">{starredRooms.length}</span>
              </div>
              {starredRooms.map(renderRoomItem)}
            </div>
          )}

          <div className="space-y-1">
            <div className="px-2 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 dark:text-violet-200/50">
              <span>{filterTitle[filter]}</span>
              <div className="flex items-center gap-2">
                {unreadTotal > 0 && (
                  <button
                    type="button"
                    disabled={markingAllRead}
                    onClick={async () => {
                      setMarkingAllRead(true);
                      try {
                        await onMarkAllRead();
                      } finally {
                        setMarkingAllRead(false);
                      }
                    }}
                    className="text-[10px] font-semibold normal-case tracking-normal text-violet-600 dark:text-violet-300 hover:underline disabled:opacity-50 cursor-pointer"
                  >
                    {markingAllRead ? 'Clearing...' : 'Mark all read'}
                  </button>
                )}
                <span className="font-mono text-zinc-400">{regularRooms.length}</span>
              </div>
            </div>
            {regularRooms.map(renderRoomItem)}
          </div>

          {filteredRooms.length === 0 && (
            <div className="text-center py-8 px-4 text-xs text-zinc-400">
              {roomQuery.trim()
                ? `No rooms matching “${roomQuery.trim()}”.`
                : `No ${filter === 'all' ? 'conversations' : filter} yet.`}
            </div>
          )}
        </div>
      </aside>
    </div>
  );

  return (
    <>
      <div className="hidden md:block h-full">{shell}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onCloseMobile} />
          <div className="relative z-50 h-full">{shell}</div>
        </div>
      )}
    </>
  );
}

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { AuthScreens } from './components/AuthScreens';
import { ChatArea } from './components/ChatArea';
import { ChatDetailsPanel } from './components/ChatDetailsPanel';
import { Sidebar } from './components/Sidebar';
import { useWorkspaceSockets } from './hooks/useWorkspaceSockets';
import { safeHostname } from './utils/url';
import type {
  Account,
  Attachment,
  Boost,
  CallParticipant,
  CallSignal,
  Message,
  Room,
  RoomTask,
  ScheduledMessage,
  Unfurl,
  User,
} from './types';

const CallOverlay = lazy(() => import('./components/CallOverlay').then((m) => ({ default: m.CallOverlay })));
const ThreadDrawer = lazy(() =>
  import('./components/chat/ThreadDrawer').then((m) => ({ default: m.ThreadDrawer }))
);
const UserProfileModal = lazy(() =>
  import('./components/modals/UserProfileModal').then((m) => ({ default: m.UserProfileModal }))
);
const RoomAssetsModal = lazy(() =>
  import('./components/modals/RoomAssetsModal').then((m) => ({ default: m.RoomAssetsModal }))
);
const ImageLightbox = lazy(() =>
  import('./components/modals/RoomAssetsModal').then((m) => ({ default: m.ImageLightbox }))
);
const NewRoomModal = lazy(() => import('./components/modals/RoomModals').then((m) => ({ default: m.NewRoomModal })));
const NewDMModal = lazy(() => import('./components/modals/RoomModals').then((m) => ({ default: m.NewDMModal })));
const ShareRoomModal = lazy(() =>
  import('./components/modals/RoomModals').then((m) => ({ default: m.ShareRoomModal }))
);
const RoomMembersModal = lazy(() =>
  import('./components/modals/RoomModals').then((m) => ({ default: m.RoomMembersModal }))
);
const RoomSettingsModal = lazy(() =>
  import('./components/modals/RoomModals').then((m) => ({ default: m.RoomSettingsModal }))
);
const ForwardModal = lazy(() =>
  import('./components/modals/RoomModals').then((m) => ({ default: m.ForwardModal }))
);
const SearchModal = lazy(() =>
  import('./components/modals/SearchAndBookmarksModals').then((m) => ({ default: m.SearchModal }))
);
const BookmarksModal = lazy(() =>
  import('./components/modals/SearchAndBookmarksModals').then((m) => ({ default: m.BookmarksModal }))
);
const MentionsModal = lazy(() =>
  import('./components/modals/SearchAndBookmarksModals').then((m) => ({ default: m.MentionsModal }))
);
const CreatePollModal = lazy(() =>
  import('./components/modals/PollAndProfileModals').then((m) => ({ default: m.CreatePollModal }))
);
const ProfileModal = lazy(() =>
  import('./components/modals/PollAndProfileModals').then((m) => ({ default: m.ProfileModal }))
);
const AdminModal = lazy(() => import('./components/modals/AdminModal').then((m) => ({ default: m.AdminModal })));

type ModalType =
  | null
  | 'newRoom'
  | 'newDM'
  | 'roomSettings'
  | 'search'
  | 'mentions'
  | 'bookmarks'
  | 'share'
  | 'members'
  | 'poll'
  | 'profile'
  | 'admin';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(() => new URLSearchParams(window.location.search).get('join'));
  const [joinAccountName, setJoinAccountName] = useState('');

  const [rooms, setRooms] = useState<Room[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [roomTasks, setRoomTasks] = useState<RoomTask[]>([]);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [highlightMessageId, setHighlightMessageId] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [threadMessageId, setThreadMessageId] = useState<number | null>(null);
  const [inspectedUser, setInspectedUser] = useState<User | null>(null);
  const [assetsModalTab, setAssetsModalTab] = useState<'media' | 'files' | 'links' | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; filename: string } | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('deepchat_theme') !== 'light');
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [showDetails, setShowDetails] = useState(() => window.innerWidth >= 1024);
  const [showPinned, setShowPinned] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  const [toast, setToast] = useState<{ roomId: number; text: string } | null>(null);
  const [callState, setCallState] = useState<{ active: boolean; video: boolean }>({ active: false, video: false });
  const [callParticipants, setCallParticipants] = useState<CallParticipant[]>([]);
  const [callSignals, setCallSignals] = useState<CallSignal[]>([]);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || null;
  const activeRoomLocked = Boolean(activeRoom?.is_locked && !activeRoom.unlocked);

  const selectRoom = useCallback((roomId: number | null, messageId?: number) => {
    setActiveRoomId(roomId);
    setHighlightMessageId(messageId ?? null);
    setShowPinned(false);
    setThreadMessageId(null);
    setCallParticipants([]);
    setTypingUsers([]);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('deepchat_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.dataset.accent = account?.custom_styles || 'violet';
  }, [account?.custom_styles]);

  useEffect(() => {
    const typingTimers = typingTimersRef.current;
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      typingTimers.forEach((timer) => clearTimeout(timer));
      typingTimers.clear();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setModal((prev) => (prev === 'search' ? null : 'search'));
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    const [accRes, roomsRes, usersRes] = await Promise.all([api.getAccount(), api.listRooms(), api.listUsers()]);
    setAccount(accRes.account);
    setRooms(roomsRes.rooms);
    setUsers(usersRes.users);
    if (roomsRes.rooms.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const urlRoom = Number(params.get('room'));
      const urlMsg = Number(params.get('msg'));
      const matched = urlRoom ? roomsRes.rooms.find((r) => r.id === urlRoom) : null;
      setActiveRoomId((prev) => prev ?? matched?.id ?? roomsRes.rooms[0].id);
      if (matched && urlMsg && !Number.isNaN(urlMsg)) {
        setHighlightMessageId(urlMsg);
      }
      if (params.get('call') === '1' && matched) {
        setCallState({ active: true, video: true });
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const boot = await api.bootstrap();
        if (cancelled) return;
        setNeedsSetup(boot.needs_setup);
        setAccount(boot.account);
        setCurrentUser(boot.user);
        if (joinCode && !boot.user) {
          try {
            const jc = await api.checkJoinCode(joinCode);
            if (!cancelled) setJoinAccountName(jc.account.name);
          } catch {
            if (!cancelled) setJoinCode(null);
          }
        }
        if (boot.user) {
          await loadWorkspaceData();
        }
      } catch (err) {
        if (!cancelled) {
          setBootError(err instanceof Error && err.message ? err.message : 'Unable to connect to DeepChat server');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [joinCode, loadWorkspaceData]);

  const reloadTasks = useCallback(async (roomId: number) => {
    try {
      const res = await api.listTasks(roomId);
      setRoomTasks(res.tasks);
    } catch {
      setRoomTasks([]);
    }
  }, []);

  // Load messages, tasks, and scheduled messages when activeRoomId changes or a locked room is unlocked
  useEffect(() => {
    if (!currentUser || !activeRoomId || activeRoomLocked) return;
    let cancelled = false;
    Promise.all([api.listMessages(activeRoomId), api.listTasks(activeRoomId), api.listScheduled(activeRoomId)])
      .then(([msgRes, taskRes, schedRes]) => {
        if (cancelled) return;
        setMessages(msgRes.messages);
        setHasMore(msgRes.has_more);
        setRoomTasks(taskRes.tasks);
        setScheduledMessages(schedRes.scheduled);
        setRooms((prev) =>
          prev.map((r) => (r.id === activeRoomId ? { ...r, unread: false, unread_count: 0, unread_at: null } : r))
        );
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([]);
          setRoomTasks([]);
          setScheduledMessages([]);
          setHasMore(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser, activeRoomId, activeRoomLocked]);

  const showToast = useCallback((roomId: number, text: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ roomId, text });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const handleRoomActivity = useCallback(
    (roomId: number) => {
      setRooms((prev) => {
        const target = prev.find((r) => r.id === roomId);
        if (!target) {
          api.listRooms().then((r) => setRooms(r.rooms)).catch(() => {});
          return prev;
        }
        if (roomId !== activeRoomId) {
          showToast(roomId, `New message in ${target.display_name}`);
          return prev.map((r) =>
            r.id === roomId ? { ...r, unread: true, unread_count: (r.unread_count ?? 0) + 1 } : r
          );
        }
        return prev;
      });
    },
    [activeRoomId, showToast]
  );

  const handleUserTyping = useCallback((userName: string) => {
    setTypingUsers((prev) => (prev.includes(userName) ? prev : [...prev, userName]));
    const prevTimer = typingTimersRef.current.get(userName);
    if (prevTimer) clearTimeout(prevTimer);
    const timer = setTimeout(() => {
      setTypingUsers((prev) => prev.filter((n) => n !== userName));
      typingTimersRef.current.delete(userName);
    }, 2500);
    typingTimersRef.current.set(userName, timer);
  }, []);

  const { roomWsRef } = useWorkspaceSockets({
    currentUser,
    activeRoomId,
    activeRoomLocked,
    onOnlineUsers: setOnlineUserIds,
    onRoomActivity: handleRoomActivity,
    onRoomsRefresh: setRooms,
    onMessageCreated: useCallback(
      (msg: Message) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          let next = [...prev, msg];
          if (msg.reply_to_id) {
            next = next.map((m) =>
              m.id === msg.reply_to_id ? { ...m, replies_count: (m.replies_count ?? 0) + 1 } : m
            );
          }
          return next;
        });
        if (msg.creator?.id === currentUser?.id && activeRoomId) {
          api.listScheduled(activeRoomId).then((r) => setScheduledMessages(r.scheduled)).catch(() => {});
        }
      },
      [activeRoomId, currentUser?.id]
    ),
    onMessageUpdated: useCallback((msg: Message) => {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
    }, []),
    onMessageDeleted: useCallback((messageId: number) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    }, []),
    onMessageBoosts: useCallback((messageId: number, boosts: Boost[]) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, boosts } : m)));
    }, []),
    onTasksChanged: useCallback(() => {
      if (activeRoomId) reloadTasks(activeRoomId);
    }, [activeRoomId, reloadTasks]),
    onUserTyping: handleUserTyping,
    onCallParticipants: setCallParticipants,
    onCallSignal: useCallback((sig: CallSignal) => {
      setCallSignals((prev) => [...prev, sig]);
    }, []),
  });

  const clearCallSignals = useCallback((uids: string[]) => {
    const uidSet = new Set(uids);
    setCallSignals((prev) => prev.filter((s) => !uidSet.has(s.uid)));
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#090710] text-zinc-300">
        Loading DeepChat...
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-[#090710] text-zinc-200 p-6 text-center">
        <p className="text-sm font-semibold text-rose-400">{bootError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold cursor-pointer"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  if (needsSetup) {
    return (
      <AuthScreens
        mode="setup"
        onAuthenticated={async (user, acc) => {
          setNeedsSetup(false);
          setCurrentUser(user);
          if (acc) setAccount(acc);
          await loadWorkspaceData();
        }}
      />
    );
  }

  if (!currentUser) {
    if (joinCode) {
      return (
        <AuthScreens
          mode="join"
          joinCode={joinCode}
          accountName={joinAccountName || account?.name}
          onSwitchToLogin={() => setJoinCode(null)}
          onAuthenticated={async (user) => {
            setCurrentUser(user);
            window.history.replaceState({}, '', '/');
            await loadWorkspaceData();
          }}
        />
      );
    }
    return (
      <AuthScreens
        mode="login"
        accountName={account?.name}
        onAuthenticated={async (user) => {
          setCurrentUser(user);
          await loadWorkspaceData();
        }}
      />
    );
  }

  const handleCreateTask = async (title: string) => {
    if (!activeRoom) return;
    const res = await api.createTask(activeRoom.id, title);
    setRoomTasks((prev) => (prev.some((t) => t.id === res.task.id) ? prev : [res.task, ...prev]));
  };

  const handleToggleTask = async (task: RoomTask) => {
    const res = await api.updateTask(task.id, { completed: !task.completed });
    setRoomTasks((prev) => prev.map((t) => (t.id === task.id ? res.task : t)));
  };

  const handleDeleteTask = async (taskId: number) => {
    await api.deleteTask(taskId);
    setRoomTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const handleToggleStar = async () => {
    if (!activeRoom) return;
    const res = await api.toggleRoomStar(activeRoom.id);
    setRooms((prev) => prev.map((r) => (r.id === activeRoom.id ? { ...r, is_starred: res.starred } : r)));
  };

  const allMedia = messages.flatMap((m) =>
    (m.attachments || []).filter((a) => a.content_type.startsWith('image/') || a.content_type.startsWith('video/'))
  );
  const allFiles = messages.flatMap((m) =>
    (m.attachments || []).filter(
      (a) => !a.content_type.startsWith('image/') && !a.content_type.startsWith('video/')
    )
  );
  const allLinks = messages
    .map((m) => {
      if (m.unfurl?.url) {
        return { url: m.unfurl.url, title: m.unfurl.title || safeHostname(m.unfurl.url) };
      }
      const match = m.body?.match(/https?:\/\/[^\s]+/);
      return match ? { url: match[0], title: safeHostname(match[0]) } : null;
    })
    .filter((x): x is { url: string; title: string } => x !== null);

  return (
    <div className="h-screen flex overflow-hidden bg-[#FAF8FE] dark:bg-[#090710]">
      {account && (
        <Sidebar
          account={account}
          currentUser={currentUser}
          rooms={rooms}
          activeRoomId={activeRoomId}
          onlineUserIds={onlineUserIds}
          darkMode={darkMode}
          mobileOpen={mobileSidebar}
          onCloseMobile={() => setMobileSidebar(false)}
          onSelectRoom={selectRoom}
          onOpenNewRoom={() => setModal('newRoom')}
          onOpenNewDM={() => setModal('newDM')}
          onOpenSearch={() => setModal('search')}
          onOpenMentions={() => setModal('mentions')}
          onOpenBookmarks={() => setModal('bookmarks')}
          onOpenProfile={() => setModal('profile')}
          onOpenAdmin={() => setModal('admin')}
          onToggleTheme={() => setDarkMode((d) => !d)}
          onMarkAllRead={async () => {
            await api.markAllRead();
            setRooms((prev) => prev.map((r) => ({ ...r, unread: false, unread_count: 0, unread_at: null })));
          }}
          onLogout={async () => {
            await api.logout();
            setCurrentUser(null);
            setRooms([]);
            setMessages([]);
            setRoomTasks([]);
            setScheduledMessages([]);
            setActiveRoomId(null);
          }}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 h-full">
        <Suspense fallback={null}>
          {callState.active && activeRoom && (
            <CallOverlay
              room={activeRoom}
              currentUser={currentUser}
              initialVideo={callState.video}
              wsRef={roomWsRef}
              participants={callParticipants}
              signalQueue={callSignals}
              onClearSignals={clearCallSignals}
              onLeave={() => setCallState({ active: false, video: false })}
            />
          )}
        </Suspense>

        <ChatArea
          key={activeRoom?.id ?? 'no-room'}
          room={activeRoom}
          currentUser={currentUser}
          messages={activeRoomLocked ? [] : messages}
          scheduledMessages={activeRoomLocked ? [] : scheduledMessages}
          highlightMessageId={highlightMessageId}
          hasMore={hasMore}
          typingUsers={typingUsers}
          callParticipants={callParticipants}
          inCall={callState.active}
          isLocked={activeRoomLocked}
          showDetails={showDetails}
          showPinned={showPinned}
          onTogglePinned={() => setShowPinned((s) => !s)}
          onClosePinned={() => setShowPinned(false)}
          onToggleDetails={() => {
            setThreadMessageId(null);
            setShowDetails((s) => !s);
          }}
          onToggleStar={handleToggleStar}
          onUpdateTopic={async (topic) => {
            if (!activeRoom) return;
            const res = await api.updateRoom(activeRoom.id, { topic });
            setRooms((prev) => prev.map((r) => (r.id === activeRoom.id ? res.room : r)));
          }}
          onCreateTask={handleCreateTask}
          onScheduleMessage={async (body, sendAtIso, attachments, replyToId) => {
            if (!activeRoom) return;
            const res = await api.createScheduled(activeRoom.id, {
              body,
              send_at: sendAtIso,
              attachments,
              reply_to_id: replyToId ?? null,
            });
            setScheduledMessages((prev) => [...prev, res.scheduled]);
          }}
          onSendScheduledNow={async (itemId) => {
            const res = await api.sendScheduledNow(itemId);
            setScheduledMessages((prev) => prev.filter((x) => x.id !== itemId));
            setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
          }}
          onCancelScheduled={async (itemId) => {
            await api.deleteScheduled(itemId);
            setScheduledMessages((prev) => prev.filter((x) => x.id !== itemId));
          }}
          onOpenThread={(messageId) => {
            setThreadMessageId(messageId);
            if (window.innerWidth < 1280) setShowDetails(false);
          }}
          onInspectUser={(user) => setInspectedUser(user)}
          onPreviewImage={(img) => setLightboxImage(img)}
          onClearHighlight={() => setHighlightMessageId(null)}
          onUnlockRoom={async (passcode) => {
            if (!activeRoom) return;
            await api.unlockRoom(activeRoom.id, passcode);
            setRooms((prev) => prev.map((r) => (r.id === activeRoom.id ? { ...r, unlocked: true } : r)));
          }}
          onStartCall={(video) => setCallState({ active: true, video })}
          onOpenShare={() => setModal('share')}
          onOpenMembers={() => setModal('members')}
          onOpenCreatePoll={() => setModal('poll')}
          onVotePoll={async (messageId, optionId) => {
            const res = await api.votePoll(messageId, optionId);
            setMessages((prev) => prev.map((m) => (m.id === messageId ? res.message : m)));
          }}
          onOpenMobileSidebar={() => setMobileSidebar(true)}
          onOpenRoomSettings={() => setModal('roomSettings')}
          onLoadMore={async () => {
            if (!activeRoom || messages.length === 0) return;
            const res = await api.listMessages(activeRoom.id, messages[0].id);
            setMessages((prev) => [...res.messages, ...prev]);
            setHasMore(res.has_more);
          }}
          onSendMessage={async (body, attachments: Attachment[], unfurl: Unfurl | null, replyToId?: number | null) => {
            if (!activeRoom) return;
            const res = await api.createMessage(activeRoom.id, {
              body,
              client_message_id: crypto.randomUUID(),
              reply_to_id: replyToId ?? null,
              attachments,
              unfurl,
            });
            setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
          }}
          onEditMessage={async (id, body) => {
            const res = await api.updateMessage(id, body);
            setMessages((prev) => prev.map((m) => (m.id === id ? res.message : m)));
          }}
          onDeleteMessage={async (id) => {
            await api.deleteMessage(id);
            setMessages((prev) => prev.filter((m) => m.id !== id));
          }}
          onToggleBoost={async (id, emoji) => {
            const res = await api.toggleBoost(id, emoji);
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, boosts: res.boosts } : m)));
          }}
          onTogglePin={async (id) => {
            const res = await api.togglePin(id);
            setMessages((prev) => prev.map((m) => (m.id === id ? res.message : m)));
          }}
          onToggleBookmark={async (id) => {
            const res = await api.toggleBookmark(id);
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, is_bookmarked: res.bookmarked } : m)));
          }}
          onForwardMessage={(msg) => setForwardingMessage(msg)}
          onChangeInvolvement={async (involvement) => {
            if (!activeRoom) return;
            await api.updateInvolvement(activeRoom.id, involvement);
            setRooms((prev) => prev.map((r) => (r.id === activeRoom.id ? { ...r, involvement } : r)));
          }}
          onTyping={() => {
            if (roomWsRef.current?.readyState === WebSocket.OPEN) {
              roomWsRef.current.send(JSON.stringify({ type: 'typing' }));
            }
          }}
        />
      </div>

      <Suspense fallback={null}>
        {threadMessageId !== null && activeRoom && !activeRoomLocked && (
          <ThreadDrawer
            key={threadMessageId}
            parentMessageId={threadMessageId}
            currentUser={currentUser}
            roomMessages={messages}
            onClose={() => setThreadMessageId(null)}
            onSendReply={async (parentId, body) => {
              const res = await api.createMessage(activeRoom.id, {
                body,
                client_message_id: crypto.randomUUID(),
                reply_to_id: parentId,
              });
              setMessages((prev) => {
                if (prev.some((m) => m.id === res.message.id)) return prev;
                return [...prev, res.message].map((m) =>
                  m.id === parentId ? { ...m, replies_count: (m.replies_count ?? 0) + 1 } : m
                );
              });
            }}
          />
        )}
      </Suspense>

      {showDetails && threadMessageId === null && activeRoom && !activeRoomLocked && (
        <ChatDetailsPanel
          room={activeRoom}
          messages={messages}
          tasks={roomTasks}
          pinnedCount={messages.filter((m) => m.is_pinned).length}
          onClose={() => setShowDetails(false)}
          onToggleMute={async () => {
            const next = activeRoom.involvement === 'nothing' ? 'mentions' : 'nothing';
            await api.updateInvolvement(activeRoom.id, next);
            setRooms((prev) => prev.map((r) => (r.id === activeRoom.id ? { ...r, involvement: next } : r)));
          }}
          onToggleStar={handleToggleStar}
          onOpenPinned={() => {
            setShowPinned(true);
            if (window.innerWidth < 1024) setShowDetails(false);
          }}
          onOpenShare={() => setModal('share')}
          onOpenMembers={() => setModal('members')}
          onOpenAssets={(tab) => setAssetsModalTab(tab)}
          onPreviewImage={(img) => setLightboxImage(img)}
          onCreateTask={handleCreateTask}
          onToggleTask={handleToggleTask}
          onDeleteTask={handleDeleteTask}
        />
      )}

      <Suspense fallback={null}>
        {lightboxImage && <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />}

        {assetsModalTab && (
          <RoomAssetsModal
            initialTab={assetsModalTab}
            media={allMedia}
            files={allFiles}
            links={allLinks}
            onClose={() => setAssetsModalTab(null)}
            onPreviewImage={(att) => {
              setAssetsModalTab(null);
              setLightboxImage({ url: att.url, filename: att.filename });
            }}
          />
        )}

        {inspectedUser && (
          <UserProfileModal
            user={inspectedUser}
            currentUserId={currentUser.id}
            online={onlineUserIds.includes(inspectedUser.id)}
            onClose={() => setInspectedUser(null)}
            onStartDM={async (uid) => {
              const res = await api.createRoom({ type: 'direct', member_ids: [uid] });
              setRooms((prev) => (prev.some((r) => r.id === res.room.id) ? prev : [...prev, res.room]));
              selectRoom(res.room.id);
            }}
          />
        )}

        {modal === 'newRoom' && (
          <NewRoomModal
            users={users}
            onClose={() => setModal(null)}
            onCreated={(room) => {
              setRooms((prev) => [...prev, room]);
              selectRoom(room.id);
            }}
          />
        )}

        {modal === 'newDM' && (
          <NewDMModal
            users={users}
            currentUserId={currentUser.id}
            joinCode={account?.join_code}
            onClose={() => setModal(null)}
            onCreated={(room) => {
              setRooms((prev) => (prev.some((r) => r.id === room.id) ? prev : [...prev, room]));
              selectRoom(room.id);
            }}
          />
        )}

        {modal === 'share' && activeRoom && account && (
          <ShareRoomModal room={activeRoom} account={account} onClose={() => setModal(null)} />
        )}

        {modal === 'members' && activeRoom && (
          <RoomMembersModal
            room={activeRoom}
            currentUserId={currentUser.id}
            onlineUserIds={onlineUserIds}
            onClose={() => setModal(null)}
            onStartDM={async (uid) => {
              const res = await api.createRoom({ type: 'direct', member_ids: [uid] });
              setRooms((prev) => (prev.some((r) => r.id === res.room.id) ? prev : [...prev, res.room]));
              selectRoom(res.room.id);
            }}
          />
        )}

        {modal === 'poll' && activeRoom && (
          <CreatePollModal
            onClose={() => setModal(null)}
            onSubmit={async (poll) => {
              const res = await api.createMessage(activeRoom.id, {
                body: '',
                client_message_id: crypto.randomUUID(),
                poll,
              });
              setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
            }}
          />
        )}

        {modal === 'roomSettings' && activeRoom && (
          <RoomSettingsModal
            room={activeRoom}
            users={users}
            currentUserId={currentUser.id}
            onClose={() => setModal(null)}
            onUpdated={(room) => setRooms((prev) => prev.map((r) => (r.id === room.id ? room : r)))}
            onDeleted={(roomId) => {
              setRooms((prev) => {
                const next = prev.filter((r) => r.id !== roomId);
                selectRoom(next[0]?.id ?? null);
                return next;
              });
            }}
            onLeft={(roomId) => {
              setRooms((prev) => {
                const next = prev.filter((r) => r.id !== roomId);
                selectRoom(next[0]?.id ?? null);
                return next;
              });
            }}
          />
        )}

        {forwardingMessage && activeRoom && (
          <ForwardModal
            message={forwardingMessage}
            rooms={rooms}
            sourceRoomName={activeRoom.display_name}
            onClose={() => setForwardingMessage(null)}
            onForwarded={(targetRoomId) => {
              if (targetRoomId !== activeRoom.id) {
                selectRoom(targetRoomId);
              }
            }}
          />
        )}

        {modal === 'search' && <SearchModal onClose={() => setModal(null)} onJumpToRoom={selectRoom} />}

        {modal === 'mentions' && <MentionsModal onClose={() => setModal(null)} onJumpToRoom={selectRoom} />}

        {modal === 'bookmarks' && (
          <BookmarksModal
            onClose={() => setModal(null)}
            onJumpToRoom={selectRoom}
            onBookmarkRemoved={(messageId) =>
              setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, is_bookmarked: false } : m)))
            }
          />
        )}

        {modal === 'profile' && (
          <ProfileModal user={currentUser} onClose={() => setModal(null)} onUpdated={(u) => setCurrentUser(u)} />
        )}

        {modal === 'admin' && account && (
          <AdminModal
            account={account}
            currentUserId={currentUser.id}
            onClose={() => setModal(null)}
            onAccountUpdated={(acc) => setAccount(acc)}
          />
        )}
      </Suspense>

      {toast && (
        <button
          type="button"
          onClick={() => {
            selectRoom(toast.roomId);
            setToast(null);
          }}
          className="fixed bottom-20 right-5 z-50 px-4 py-2.5 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shadow-xl border border-zinc-700 dark:border-stone-300 hover:scale-105 transition cursor-pointer"
        >
          {toast.text}
        </button>
      )}
    </div>
  );
}

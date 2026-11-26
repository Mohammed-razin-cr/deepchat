import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowsInSimple,
  ArrowsOutSimple,
  Check,
  Copy,
  MonitorArrowUp,
  Microphone,
  MicrophoneSlash,
  PhoneDisconnect,
  Users,
  VideoCamera,
  VideoCameraSlash,
} from '@phosphor-icons/react';
import type { CallParticipant, CallSignal, Room, User } from '../types';
import { Avatar } from './Avatar';

interface CallOverlayProps {
  room: Room;
  currentUser: User;
  initialVideo: boolean;
  wsRef: React.MutableRefObject<WebSocket | null>;
  participants: CallParticipant[];
  signalQueue: CallSignal[];
  onClearSignals: (uids: string[]) => void;
  onLeave: () => void;
}

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export function CallOverlay({
  room,
  currentUser,
  initialVideo,
  wsRef,
  participants,
  signalQueue,
  onClearSignals,
  onLeave,
}: CallOverlayProps) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(initialVideo);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [mediaError, setMediaError] = useState('');

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const peersRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<number, MediaStream>>(new Map());

  const sendWs = useCallback(
    (payload: Record<string, unknown>) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload));
      }
    },
    [wsRef]
  );

  // Acquire local media and announce join
  useEffect(() => {
    let active = true;
    const peers = peersRef.current;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: initialVideo,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        sendWs({ type: 'call.join', audio: true, video: initialVideo });
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        setMediaError(message || 'Microphone/camera unavailable — joined in listen-only mode');
        sendWs({ type: 'call.join', audio: false, video: false });
      }
    })();

    return () => {
      active = false;
      sendWs({ type: 'call.leave' });
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      peers.forEach((pc) => pc.close());
      peers.clear();
    };
  }, [room.id, initialVideo, sendWs]);

  const getOrCreatePeer = useCallback(
    (targetUserId: number, initiator: boolean) => {
      const existing = peersRef.current.get(targetUserId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendWs({ type: 'call.ice', target_id: targetUserId, candidate: ev.candidate });
        }
      };

      pc.ontrack = (ev) => {
        const stream = ev.streams[0];
        if (stream) {
          setRemoteStreams((prev) => new Map(prev).set(targetUserId, stream));
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.delete(targetUserId);
            return next;
          });
        }
      };

      peersRef.current.set(targetUserId, pc);

      if (initiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer).then(() => offer))
          .then((offer) => sendWs({ type: 'call.offer', target_id: targetUserId, sdp: offer }))
          .catch(() => {
            setMediaError('Failed to negotiate peer connection.');
          });
      }

      return pc;
    },
    [sendWs]
  );

  // Connect to new participants (deterministic initiator: higher user_id initiates)
  useEffect(() => {
    const activeIds = new Set(participants.map((p) => p.user_id));
    for (const p of participants) {
      if (p.user_id !== currentUser.id && !peersRef.current.has(p.user_id)) {
        const shouldInitiate = currentUser.id > p.user_id;
        getOrCreatePeer(p.user_id, shouldInitiate);
      }
    }
    for (const [uid, pc] of peersRef.current.entries()) {
      if (!activeIds.has(uid)) {
        pc.close();
        peersRef.current.delete(uid);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(uid);
          return next;
        });
      }
    }
  }, [participants, currentUser.id, getOrCreatePeer]);

  // Process incoming WebRTC signaling messages atomically by signal uid
  useEffect(() => {
    if (signalQueue.length === 0) return;
    let cancelled = false;
    const processedUids: string[] = [];

    (async () => {
      for (const sig of signalQueue) {
        processedUids.push(sig.uid);
        const fromId = sig.from_id;
        if (!fromId || cancelled) continue;
        try {
          if (sig.type === 'call.offer' && sig.sdp) {
            const pc = getOrCreatePeer(fromId, false);
            await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendWs({ type: 'call.answer', target_id: fromId, sdp: answer });
          } else if (sig.type === 'call.answer' && sig.sdp) {
            const pc = peersRef.current.get(fromId);
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
          } else if (sig.type === 'call.ice' && sig.candidate) {
            const pc = peersRef.current.get(fromId);
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
          }
        } catch {
          // ignore transient ICE/SDP race on disconnect
        }
      }
      if (!cancelled && processedUids.length > 0) {
        onClearSignals(processedUids);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signalQueue, getOrCreatePeer, onClearSignals, sendWs]);

  const stopScreenShare = () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    const camTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
    peersRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(camTrack).catch(() => {});
      }
    });
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    setSharingScreen(false);
    setCamOn(Boolean(camTrack && camTrack.enabled));
  };

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
    sendWs({ type: 'call.media', audio: next, video: camOn });
  };

  const toggleCam = async () => {
    const next = !camOn;
    if (next && !localStreamRef.current?.getVideoTracks().length) {
      try {
        const vidStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = vidStream.getVideoTracks()[0];
        if (localStreamRef.current) {
          localStreamRef.current.addTrack(track);
        } else {
          localStreamRef.current = vidStream;
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
        peersRef.current.forEach((pc) => {
          if (localStreamRef.current) pc.addTrack(track, localStreamRef.current);
        });
      } catch {
        setMediaError('Camera unavailable');
        return;
      }
    } else {
      localStreamRef.current?.getVideoTracks().forEach((t) => {
        t.enabled = next;
      });
    }
    setCamOn(next);
    sendWs({ type: 'call.media', audio: micOn, video: next });
  };

  const toggleScreenShare = async () => {
    if (sharingScreen) {
      stopScreenShare();
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack).catch(() => {});
        } else {
          pc.addTrack(screenTrack, screenStream);
        }
      });
      if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
      setSharingScreen(true);
      setCamOn(true);
      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch {
      // user cancelled display picker
    }
  };

  const copyCallLink = () => {
    const url = `${window.location.origin}/?room=${room.id}&call=1`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1600);
  };

  const otherParticipants = participants.filter((p) => p.user_id !== currentUser.id);

  if (minimized) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-20 right-5 z-40 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#16161A] text-white border border-zinc-800 shadow-2xl"
      >
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        <div className="text-xs font-semibold">
          {room.display_name} · {Math.max(1, participants.length)} in call
        </div>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 cursor-pointer"
          title="Expand"
        >
          <ArrowsOutSimple size={15} />
        </button>
        <button
          type="button"
          onClick={onLeave}
          className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 cursor-pointer"
          title="Leave call"
        >
          <PhoneDisconnect size={15} />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-zinc-950 text-white border-b border-zinc-800 px-4 py-3 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-sm">{room.display_name} — Live Call</span>
          <span className="text-xs text-zinc-400 flex items-center gap-1">
            <Users size={13} />
            {Math.max(1, participants.length)}
          </span>
          {mediaError && <span className="text-xs text-amber-400">{mediaError}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyCallLink}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium cursor-pointer"
          >
            {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            {copiedLink ? 'Call Link Copied' : 'Share Call Link'}
          </button>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
            title="Minimize"
          >
            <ArrowsInSimple size={15} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto">
        <div className="relative rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden aspect-video flex items-center justify-center">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={`w-full h-full object-cover ${camOn || sharingScreen ? 'block' : 'hidden'}`}
          />
          {!camOn && !sharingScreen && (
            <div className="flex flex-col items-center gap-1.5">
              <Avatar user={currentUser} size="md" />
              <span className="text-xs text-zinc-400">You {micOn ? '' : '(Muted)'}</span>
            </div>
          )}
          <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-[11px] font-medium">
            {sharingScreen ? 'Screen Sharing' : 'You'}
          </span>
        </div>

        {otherParticipants.map((p) => {
          const stream = remoteStreams.get(p.user_id);
          return <RemoteTile key={p.user_id} participant={p} stream={stream} />;
        })}
      </div>

      <div className="flex items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={toggleMic}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
            micOn ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
          }`}
        >
          {micOn ? <Microphone size={16} /> : <MicrophoneSlash size={16} />}
          {micOn ? 'Mute' : 'Unmute'}
        </button>
        <button
          type="button"
          onClick={toggleCam}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
            camOn ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
          }`}
        >
          {camOn ? <VideoCamera size={16} /> : <VideoCameraSlash size={16} />}
          {camOn ? 'Camera On' : 'Camera Off'}
        </button>
        <button
          type="button"
          onClick={toggleScreenShare}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
            sharingScreen ? 'bg-violet-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-white'
          }`}
        >
          <MonitorArrowUp size={16} />
          {sharingScreen ? 'Sharing Screen' : 'Share Screen'}
        </button>
        <button
          type="button"
          onClick={onLeave}
          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
        >
          <PhoneDisconnect size={16} />
          Leave Call
        </button>
      </div>
    </motion.div>
  );
}

function RemoteTile({ participant, stream }: { participant: CallParticipant; stream?: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden aspect-video flex items-center justify-center">
      {stream ? (
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center font-bold text-sm">
            {participant.user_name.slice(0, 2).toUpperCase()}
          </div>
          <span className="text-xs text-zinc-400">Connecting...</span>
        </div>
      )}
      <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-[11px] font-medium">
        {participant.user_name}
      </span>
    </div>
  );
}

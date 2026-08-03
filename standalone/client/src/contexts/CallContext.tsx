import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { socket } from '@/lib/socket';

export type CallType = 'video' | 'audio';
type CallState = 'idle' | 'calling' | 'receiving' | 'active';

interface RemoteUser {
  username: string;
  socketId: string;
}

interface CallContextType {
  currentUser: string | null;
  joinAsUser: (name: string) => void;
  leaveSession: () => void;
  callState: CallState;
  callType: CallType;
  remoteUser: RemoteUser | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMicMuted: boolean;
  isCameraOff: boolean;
  initiateCall: (user: RemoteUser, type: CallType) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
}

const CallContext = createContext<CallContextType | null>(null);

// ── ICE / Connection config ────────────────────────────────────────────────
const getIceServers = (): RTCConfiguration => {
  const customIce = import.meta.env.VITE_ICE_SERVERS;
  if (customIce) {
    try {
      console.log('[WebRTC] Using custom ICE servers configuration.');
      return JSON.parse(customIce);
    } catch (e) {
      console.warn('[WebRTC] Failed to parse VITE_ICE_SERVERS environment variable', e);
    }
  }

  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turns:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };
};

const ICE_SERVERS = getIceServers();

// ── High-quality media constraints ─────────────────────────────────────────
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
  sampleSize: 16,
};

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 60 },
  facingMode: 'user',
};

const STORAGE_KEY = 'calling_app_username';

// ── Ringtone via Web Audio API ─────────────────────────────────────────────
function playBeep(ctx: AudioContext, freq: number, dur: number, vol = 0.15) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + dur);
}

// ── Provider ───────────────────────────────────────────────────────────────
export const CallProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY) || null,
  );

  const [callState, setCallState] = useState<CallState>('idle');
  const [callType, setCallType] = useState<CallType>('video');
  const [remoteUser, setRemoteUser] = useState<RemoteUser | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // Mutable ref — read by single-registered socket handlers (no stale closures)
  const r = useRef({
    callState: 'idle' as CallState,
    callType: 'video' as CallType,
    pc: null as RTCPeerConnection | null,
    remoteSocketId: null as string | null,
    localStream: null as MediaStream | null,
    pendingOffer: null as RTCSessionDescriptionInit | null,
    remoteDescSet: false,
    iceCandidateQueue: [] as RTCIceCandidateInit[],
    iceConfig: null as RTCConfiguration | null,
  });

  const syncCallState = useCallback((s: CallState) => {
    r.current.callState = s;
    setCallState(s);
  }, []);

  const syncCallType = useCallback((t: CallType) => {
    r.current.callType = t;
    setCallType(t);
  }, []);

  // ── Ringtone ───────────────────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringtoneRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRingtone = useCallback(() => {
    if (ringtoneRef.current) {
      clearInterval(ringtoneRef.current);
      ringtoneRef.current = null;
    }
  }, []);

  const startRingtone = useCallback(
    (type: 'outgoing' | 'incoming') => {
      stopRingtone();
      const getCtx = () => {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioContext();
        }
        if (audioCtxRef.current.state === 'suspended')
          audioCtxRef.current.resume();
        return audioCtxRef.current;
      };
      const play = () => {
        const ctx = getCtx();
        if (type === 'incoming') {
          playBeep(ctx, 440, 0.4, 0.2);
          setTimeout(() => playBeep(ctx, 480, 0.4, 0.2), 200);
        } else {
          playBeep(ctx, 480, 1.2, 0.12);
        }
      };
      play();
      ringtoneRef.current = setInterval(
        play,
        type === 'incoming' ? 2500 : 4000,
      );
    },
    [stopRingtone],
  );

  // ── Cleanup helpers ────────────────────────────────────────────────────
  const closePeerConnection = useCallback(() => {
    if (r.current.pc) {
      r.current.pc.close();
      r.current.pc = null;
    }
    r.current.remoteDescSet = false;
    r.current.iceCandidateQueue = [];
  }, []);

  const stopLocalTracks = useCallback(() => {
    r.current.localStream?.getTracks().forEach((t) => t.stop());
    r.current.localStream = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIsMicMuted(false);
    setIsCameraOff(false);
  }, []);

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearConnectionTimeout();
    stopRingtone();
    closePeerConnection();
    stopLocalTracks();
    r.current.remoteSocketId = null;
    r.current.pendingOffer = null;
    setRemoteUser(null);
    syncCallState('idle');
    syncCallType('video');
  }, [
    clearConnectionTimeout,
    stopRingtone,
    closePeerConnection,
    stopLocalTracks,
    syncCallState,
    syncCallType,
  ]);

  const startConnectionTimeout = useCallback(() => {
    clearConnectionTimeout();
    connectionTimeoutRef.current = setTimeout(() => {
      const pc = r.current.pc;
      if (pc && pc.connectionState !== 'connected') {
        console.warn('[WebRTC] Connection timeout reached (15s). Resetting call.');
        alert('Could not establish call connection. Please try again.');
        reset();
      }
    }, 15000);
  }, [clearConnectionTimeout, reset]);

  // ── ICE candidate queue helper ─────────────────────────────────────────
  const flushQueue = useCallback(async (pc: RTCPeerConnection) => {
    const queue = r.current.iceCandidateQueue;
    r.current.iceCandidateQueue = [];
    for (const c of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.warn('[ICE] flush error', e);
      }
    }
  }, []);

  const createPC = useCallback((): RTCPeerConnection => {
    const savedQueue = [...r.current.iceCandidateQueue];
    closePeerConnection();
    const config = r.current.iceConfig || ICE_SERVERS;
    const pc = new RTCPeerConnection(config);
    r.current.pc = pc;
    r.current.remoteDescSet = false;
    r.current.iceCandidateQueue = savedQueue;

    pc.onicecandidate = (event) => {
      if (event.candidate && r.current.remoteSocketId) {
        socket.emit('ice-candidate', {
          to: r.current.remoteSocketId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[ICE]', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.warn('[ICE] failed — restarting');
        pc.restartIce();
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Peer]', pc.connectionState);
      if (pc.connectionState === 'connected') {
        clearConnectionTimeout();
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        console.warn('[Peer] Connection failed or closed. Resetting call state.');
        clearConnectionTimeout();
        reset();
      }
    };

    // Always create a new MediaStream on every ontrack so React's Object.is
    // comparison detects the change and triggers a re-render.
    const inbound = new MediaStream();
    pc.ontrack = (event) => {
      console.log('[ontrack]', event.track.kind, 'streams:', event.streams.length);
      if (event.streams[0]) {
        setRemoteStream(new MediaStream(event.streams[0].getTracks()));
      } else {
        inbound.addTrack(event.track);
        setRemoteStream(new MediaStream(inbound.getTracks()));
      }
    };

    return pc;
  }, [closePeerConnection, clearConnectionTimeout, reset]);

  // ── Media acquisition ──────────────────────────────────────────────────
  const getMedia = useCallback(
    async (type: CallType): Promise<MediaStream | null> => {
      console.log('[getMedia] Starting media acquisition, requested type:', type);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('[getMedia] mediaDevices.getUserMedia is NOT supported in this context!');
        return null;
      }
      if (type === 'audio') {
        const attempts: MediaStreamConstraints[] = [
          { audio: AUDIO_CONSTRAINTS, video: false },
          { audio: true, video: false },
        ];
        for (const c of attempts) {
          try {
            console.log('[getMedia] Attempting audio constraint:', c);
            const stream = await navigator.mediaDevices.getUserMedia(c);
            console.log('[getMedia] Audio acquisition succeeded!');
            r.current.localStream = stream;
            setLocalStream(stream);
            return stream;
          } catch (e) {
            console.warn('[Media] audio attempt failed', c, e);
          }
        }
      } else {
        // Video + audio — fall back to audio-only if no camera
        const attempts: MediaStreamConstraints[] = [
          { audio: AUDIO_CONSTRAINTS, video: VIDEO_CONSTRAINTS },
          { audio: AUDIO_CONSTRAINTS, video: true },
          { audio: true, video: true },
          { audio: true, video: false },
        ];
        for (const c of attempts) {
          try {
            console.log('[getMedia] Attempting video/audio constraint:', c);
            const stream = await navigator.mediaDevices.getUserMedia(c);
            console.log('[getMedia] Video/audio acquisition succeeded! Has video tracks:', stream.getVideoTracks().length > 0);
            r.current.localStream = stream;
            setLocalStream(stream);
            return stream;
          } catch (e) {
            console.warn('[Media] video attempt failed', c, e);
          }
        }
      }
      console.error('[Media] Could not get any media stream');
      return null;
    },
    [],
  );

  // ── Socket connection ──────────────────────────────────────────────────
  const connectSocket = useCallback((username: string) => {
    if (socket.connected) {
      socket.emit('join', username);
    } else {
      socket.connect();
    }
  }, []);

  const joinAsUser = useCallback(
    (name: string) => {
      localStorage.setItem(STORAGE_KEY, name);
      setCurrentUser(name);
      connectSocket(name);
    },
    [connectSocket],
  );

  const leaveSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setCurrentUser(null);
    reset();
    socket.disconnect();
  }, [reset]);

  // Restore session and fetch dynamic ICE configuration on mount
  useEffect(() => {
    if (currentUser) connectSocket(currentUser);

    const fetchIceConfig = async () => {
      try {
        const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
        console.log('[WebRTC] Fetching ICE/TURN configuration from backend:', `${serverUrl}/api/ice-servers`);
        const response = await fetch(`${serverUrl}/api/ice-servers`);
        if (response.ok) {
          const config = await response.json();
          r.current.iceConfig = config;
          console.log('[WebRTC] Successfully loaded dynamic ICE servers.');
        }
      } catch (e) {
        console.error('[WebRTC] Failed to load ICE servers from backend', e);
      }
    };
    fetchIceConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket event listeners — registered ONCE ──────────────────────────
  useEffect(() => {
    const onConnect = () => {
      const username = localStorage.getItem(STORAGE_KEY);
      if (username) {
        socket.emit('join', username);
      }
    };

    const onIncomingCall = ({
      from,
      fromUsername,
      offer,
      callType: incomingType,
    }: {
      from: string;
      fromUsername: string;
      offer: RTCSessionDescriptionInit;
      callType: CallType;
    }) => {
      console.log('[onIncomingCall] Received incoming-call event! from:', fromUsername, 'fromSocket:', from, 'type:', incomingType, 'current state:', r.current.callState);
      if (r.current.callState !== 'idle') {
        console.warn('[onIncomingCall] Rejecting call: client is not in idle state. State:', r.current.callState);
        socket.emit('reject-call', { to: from });
        return;
      }
      r.current.remoteSocketId = from;
      r.current.pendingOffer = offer;
      syncCallType(incomingType ?? 'video');
      setRemoteUser({ socketId: from, username: fromUsername });
      console.log('[onIncomingCall] transitioning state to receiving...');
      syncCallState('receiving');
      console.log('[onIncomingCall] starting incoming ringtone...');
      startRingtone('incoming');
    };

    const onCallAnswered = async ({
      answer,
    }: {
      answer: RTCSessionDescriptionInit;
    }) => {
      const pc = r.current.pc;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        r.current.remoteDescSet = true;
        await flushQueue(pc);
        stopRingtone();
        syncCallState('active');
        startConnectionTimeout();
      } catch (e) {
        console.error('[WS] call-answered error', e);
        reset();
      }
    };

    const onIceCandidate = async ({
      candidate,
    }: {
      candidate: RTCIceCandidateInit;
    }) => {
      if (!candidate) return;
      const pc = r.current.pc;
      if (!pc || !r.current.remoteDescSet) {
        r.current.iceCandidateQueue.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[ICE] addIceCandidate error', e);
      }
    };

    const onCallEnded = () => reset();
    const onCallRejected = () => {
      stopRingtone();
      reset();
    };

    socket.on('connect', onConnect);
    socket.on('incoming-call', onIncomingCall);
    socket.on('call-answered', onCallAnswered);
    socket.on('ice-candidate', onIceCandidate);
    socket.on('call-ended', onCallEnded);
    socket.on('call-rejected', onCallRejected);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('incoming-call', onIncomingCall);
      socket.off('call-answered', onCallAnswered);
      socket.off('ice-candidate', onIceCandidate);
      socket.off('call-ended', onCallEnded);
      socket.off('call-rejected', onCallRejected);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Call actions ───────────────────────────────────────────────────────
  const initiateCall = useCallback(
    async (user: RemoteUser, type: CallType) => {
      console.log('[initiateCall] user:', user, 'type:', type);
      r.current.remoteSocketId = user.socketId;
      syncCallType(type);
      setRemoteUser(user);
      syncCallState('calling');
      startRingtone('outgoing');

      const stream = await getMedia(type);
      if (!stream) {
        console.error('[initiateCall] failed to get local stream');
        reset();
        return;
      }

      console.log('[initiateCall] local stream acquired, setting up peer connection...');
      const pc = createPC();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      console.log('[initiateCall] creating offer...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      console.log('[initiateCall] sending offer to server for socketId:', user.socketId);
      socket.emit('call-user', {
        to: user.socketId,
        offer: pc.localDescription,
        callType: type,
      });
    },
    [startRingtone, getMedia, createPC, reset, syncCallState, syncCallType],
  );

  const acceptCall = useCallback(async () => {
    console.log('[acceptCall] accepting call, remoteSocketId:', r.current.remoteSocketId);
    stopRingtone();
    const offer = r.current.pendingOffer;
    const type = r.current.callType;
    if (!offer) {
      console.error('[acceptCall] no pending offer found!');
      return;
    }

    const stream = await getMedia(type);
    if (!stream) {
      console.error('[acceptCall] failed to get local stream');
      if (r.current.remoteSocketId)
        socket.emit('reject-call', { to: r.current.remoteSocketId });
      reset();
      return;
    }

    console.log('[acceptCall] local stream acquired, setting up peer connection...');
    const pc = createPC();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    r.current.remoteDescSet = true;
    await flushQueue(pc);

    console.log('[acceptCall] creating answer...');
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    console.log('[acceptCall] sending answer to server for socketId:', r.current.remoteSocketId);
    socket.emit('answer-call', {
      to: r.current.remoteSocketId,
      answer: pc.localDescription,
    });
    syncCallState('active');
    startConnectionTimeout();
  }, [stopRingtone, getMedia, createPC, flushQueue, reset, syncCallState, startConnectionTimeout]);

  const rejectCall = useCallback(() => {
    if (r.current.remoteSocketId)
      socket.emit('reject-call', { to: r.current.remoteSocketId });
    reset();
  }, [reset]);

  const endCall = useCallback(() => {
    if (r.current.remoteSocketId)
      socket.emit('end-call', { to: r.current.remoteSocketId });
    reset();
  }, [reset]);

  const toggleMic = useCallback(() => {
    const stream = r.current.localStream;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMicMuted(!track.enabled);
    }
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = r.current.localStream;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsCameraOff(!track.enabled);
    }
  }, []);

  return (
    <CallContext.Provider
      value={{
        currentUser,
        joinAsUser,
        leaveSession,
        callState,
        callType,
        remoteUser,
        localStream,
        remoteStream,
        isMicMuted,
        isCameraOff,
        initiateCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMic,
        toggleCamera,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCallContext = () => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCallContext must be used within CallProvider');
  return ctx;
};

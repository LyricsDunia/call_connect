import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useCallContext } from '@/contexts/CallContext';
import { cn } from '@/lib/utils';

function VideoBox({
  stream,
  muted = false,
  className,
  mirror = false,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  mirror?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!stream) {
      el.srcObject = null;
      return;
    }
    el.srcObject = stream;
    el.play().catch((e) => console.warn('[VideoBox] play error', e));
    const onAdd = () => el.play().catch(() => {});
    stream.addEventListener('addtrack', onAdd);
    return () => stream.removeEventListener('addtrack', onAdd);
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={cn(mirror && '[transform:scaleX(-1)]', className)}
    />
  );
}

function AudioBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-6">
      {[0.4, 0.7, 1, 0.6, 0.8].map((h, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-green-400"
          animate={active ? { scaleY: [h, 1, h * 0.5, 1, h] } : { scaleY: 0.15 }}
          transition={{ repeat: Infinity, duration: 0.8 + i * 0.1, ease: 'easeInOut' }}
          style={{ height: '100%', transformOrigin: 'bottom' }}
        />
      ))}
    </div>
  );
}

function CallTypeBadge({ type }: { type: 'video' | 'audio' }) {
  return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white/60 text-xs font-medium">
      {type === 'audio' ? <Mic className="w-3 h-3" /> : <Video className="w-3 h-3" />}
      {type === 'audio' ? 'Voice Call' : 'Video Call'}
    </span>
  );
}

export function CallOverlay() {
  const {
    callState,
    callType,
    remoteUser,
    localStream,
    remoteStream,
    isMicMuted,
    isCameraOff,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
  } = useCallContext();

  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  useEffect(() => {
    if (!remoteStream) {
      setHasRemoteVideo(false);
      return;
    }
    const check = () =>
      setHasRemoteVideo(
        remoteStream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled),
      );
    check();
    remoteStream.addEventListener('addtrack', check);
    remoteStream.addEventListener('removetrack', check);
    return () => {
      remoteStream.removeEventListener('addtrack', check);
      remoteStream.removeEventListener('removetrack', check);
    };
  }, [remoteStream]);

  const hasLocalVideo =
    !isCameraOff &&
    localStream?.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');

  if (callState === 'idle') return null;

  const initial = remoteUser?.username.charAt(0).toUpperCase() ?? '?';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-3xl overflow-hidden"
      >
        {callState === 'active' && (
          <>
            {callType === 'video' && (
              <div className="relative w-full h-full flex flex-col bg-black">
                <div className="absolute inset-0">
                  {remoteStream ? (
                    <>
                      <VideoBox
                        stream={remoteStream}
                        className={cn(
                          'w-full h-full object-cover transition-opacity duration-500',
                          hasRemoteVideo ? 'opacity-100' : 'opacity-0 pointer-events-none',
                        )}
                      />
                      <div
                        className={cn(
                          'absolute inset-0 flex flex-col items-center justify-center bg-gray-900 gap-4 transition-opacity duration-500',
                          hasRemoteVideo ? 'opacity-0 pointer-events-none' : 'opacity-100',
                        )}
                      >
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-4xl font-bold text-white">
                          {initial}
                        </div>
                        <p className="text-lg font-medium text-white/60">{remoteUser?.username}</p>
                        <p className="text-sm text-white/30">Camera off</p>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 gap-4">
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-4xl font-bold text-white">
                        {initial}
                      </div>
                      <p className="text-lg font-medium text-white/60">{remoteUser?.username}</p>
                      <div className="flex items-center gap-2 text-white/30 text-sm">
                        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                        Connecting…
                      </div>
                    </div>
                  )}
                </div>

                <div className="absolute top-0 inset-x-0 p-6 bg-gradient-to-b from-black/70 to-transparent z-10 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                    <span className="text-xl font-semibold text-white">{remoteUser?.username}</span>
                  </div>
                  <CallTypeBadge type={callType} />
                </div>

                <motion.div
                  initial={{ scale: 0.8, opacity: 0, y: 40 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, type: 'spring' }}
                  className="absolute bottom-28 right-4 w-28 h-40 sm:w-40 sm:h-56 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl z-20 bg-gray-900"
                >
                  {localStream && hasLocalVideo ? (
                    <VideoBox stream={localStream} muted mirror className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 text-white/30 gap-2">
                      <VideoOff className="w-6 h-6" />
                      <span className="text-xs">Camera off</span>
                    </div>
                  )}
                </motion.div>

                <div className="absolute bottom-6 inset-x-0 flex justify-center items-center gap-5 z-30">
                  <button
                    onClick={toggleMic}
                    title={isMicMuted ? 'Unmute' : 'Mute'}
                    className={cn(
                      'p-4 rounded-full shadow-lg transition-all duration-200 hover:scale-110 active:scale-95',
                      isMicMuted ? 'bg-white/20 text-white backdrop-blur' : 'bg-white text-black',
                    )}
                  >
                    {isMicMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </button>
                  <button
                    onClick={endCall}
                    title="Hang up"
                    className="p-5 rounded-full bg-red-600 text-white shadow-xl shadow-red-600/40 transition-all duration-200 hover:scale-110 hover:bg-red-500 active:scale-95"
                  >
                    <PhoneOff className="w-7 h-7" />
                  </button>
                  <button
                    onClick={toggleCamera}
                    title={isCameraOff ? 'Camera on' : 'Camera off'}
                    className={cn(
                      'p-4 rounded-full shadow-lg transition-all duration-200 hover:scale-110 active:scale-95',
                      isCameraOff ? 'bg-white/20 text-white backdrop-blur' : 'bg-white text-black',
                    )}
                  >
                    {isCameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                  </button>
                </div>
              </div>
            )}

            {callType === 'audio' && (
              <div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-gray-950 to-gray-900">
                <motion.div
                  animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.35, 0.2] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                  className="absolute w-80 h-80 rounded-full bg-primary/20 blur-3xl"
                />
                <div className="relative z-10 flex flex-col items-center gap-8">
                  <div className="relative">
                    <motion.div
                      animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
                      transition={{ repeat: Infinity, duration: 2.5 }}
                      className="absolute inset-0 rounded-full bg-primary/40 blur-lg"
                    />
                    <div className="relative w-36 h-36 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-5xl font-bold text-white shadow-2xl">
                      {initial}
                    </div>
                    <div className="absolute -bottom-4 left-1/2 -translate-x-1/2">
                      <AudioBars active={!isMicMuted && !!remoteStream} />
                    </div>
                  </div>
                  <div className="text-center mt-4">
                    <p className="text-3xl font-bold text-white">{remoteUser?.username}</p>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-white/50 text-sm">Voice call connected</span>
                    </div>
                  </div>
                  <CallTypeBadge type="audio" />
                </div>
                <div className="absolute bottom-10 inset-x-0 flex justify-center items-center gap-6 z-30">
                  <button
                    onClick={toggleMic}
                    title={isMicMuted ? 'Unmute' : 'Mute'}
                    className={cn(
                      'p-4 rounded-full shadow-lg transition-all duration-200 hover:scale-110 active:scale-95',
                      isMicMuted
                        ? 'bg-white/20 text-white backdrop-blur ring-2 ring-white/30'
                        : 'bg-white text-black',
                    )}
                  >
                    {isMicMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </button>
                  <button
                    onClick={endCall}
                    title="Hang up"
                    className="p-5 rounded-full bg-red-600 text-white shadow-xl shadow-red-600/40 transition-all duration-200 hover:scale-110 hover:bg-red-500 active:scale-95"
                  >
                    <PhoneOff className="w-7 h-7" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {callState === 'calling' && (
          <div className="flex flex-col items-center justify-center text-center gap-8 px-6">
            <div className="relative">
              <motion.div
                animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 rounded-full bg-primary/30 blur-xl"
              />
              <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-4xl font-bold text-white shadow-2xl">
                {initial}
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-white">Calling…</h2>
              <p className="text-xl text-white/60">{remoteUser?.username}</p>
              <CallTypeBadge type={callType} />
              <p className="text-sm text-white/30 pt-1">Waiting for them to answer</p>
            </div>
            <button
              onClick={endCall}
              className="flex items-center gap-3 px-8 py-4 rounded-full bg-red-600 text-white font-medium shadow-lg hover:bg-red-500 transition-all active:scale-95"
            >
              <PhoneOff className="w-5 h-5" /> Cancel
            </button>
          </div>
        )}

        {callState === 'receiving' && (
          <div className="flex flex-col items-center justify-center text-center gap-10 px-6">
            <div className="space-y-4">
              <motion.div
                animate={{ y: [-8, 8, -8] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-primary to-accent shadow-2xl shadow-primary/40 flex items-center justify-center text-4xl font-bold text-white"
              >
                {initial}
              </motion.div>
              <h2 className="text-4xl font-bold text-white">{remoteUser?.username}</h2>
              <div className="flex flex-col items-center gap-2">
                <p className="text-sm text-white/50 uppercase tracking-widest">Incoming Call</p>
                <CallTypeBadge type={callType} />
              </div>
            </div>
            <div className="flex items-center gap-14">
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={rejectCall}
                  className="p-6 rounded-full bg-red-600 text-white shadow-lg shadow-red-600/30 hover:scale-110 transition-transform active:scale-95"
                >
                  <PhoneOff className="w-8 h-8" />
                </button>
                <span className="text-sm text-white/40">Decline</span>
              </div>
              <div className="flex flex-col items-center gap-3">
                <motion.button
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                  onClick={acceptCall}
                  className="p-6 rounded-full bg-green-500 text-white shadow-lg shadow-green-500/40 hover:scale-110 transition-transform active:scale-95"
                >
                  <Phone className="w-8 h-8" />
                </motion.button>
                <span className="text-sm text-white/40">Accept</span>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

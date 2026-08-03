import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useCallContext } from '@/contexts/CallContext';
import { cn } from '@/lib/utils';
import { getAvatarUrl } from '@/lib/avatar';

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
    acceptCall,
    rejectCall,
    endCall,
  } = useCallContext();

  const frameRef = useRef<any>(null);

  useEffect(() => {
    if (callState === 'active') {
      // Release local camera/mic tracks so the embedded Metered iframe can acquire them
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      try {
        const MeteredFrame = (window as any).MeteredFrame;
        if (MeteredFrame) {
          console.log('[Metered] Initializing MeteredFrame...');
          const frame = new MeteredFrame();
          frameRef.current = frame;
          frame.init({
            roomURL: "smarteins.metered.live/lyrics",
          }, document.getElementById("metered-frame"));

          frame.on("meetingLeft", () => {
            console.log('[Metered] Meeting left by user');
            endCall();
          });
        } else {
          console.error('[Metered] MeteredFrame SDK is not loaded on window!');
        }
      } catch (e) {
        console.error('[Metered] Failed to initialize MeteredFrame', e);
      }
    }

    return () => {
      if (frameRef.current) {
        try {
          frameRef.current.leave();
        } catch (e) {
          // ignore
        }
        frameRef.current = null;
      }
    };
  }, [callState, localStream, endCall]);

  if (callState === 'idle') return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-3xl overflow-hidden"
      >
        {callState === 'active' && (
          <div className="relative w-full h-full flex flex-col bg-black">
            <div id="metered-frame" className="w-full h-full min-h-[500px] flex-1"></div>
          </div>
        )}

        {callState === 'calling' && (
          <div className="flex flex-col items-center justify-center text-center gap-8 px-6">
            <div className="relative">
              <motion.div
                animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 rounded-full bg-primary/30 blur-xl"
              />
              <img
                src={getAvatarUrl(remoteUser?.username || '')}
                alt={remoteUser?.username}
                className="relative w-32 h-32 rounded-full border-4 border-white/20 object-cover shadow-2xl z-10"
              />
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
              <motion.img
                animate={{ y: [-8, 8, -8] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                src={getAvatarUrl(remoteUser?.username || '')}
                alt={remoteUser?.username}
                className="w-32 h-32 mx-auto rounded-full border-4 border-white/20 shadow-2xl shadow-primary/40 object-cover"
              />
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

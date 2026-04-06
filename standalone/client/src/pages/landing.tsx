import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation, useSearch } from 'wouter';
import { ArrowRight, Video, UserCircle } from 'lucide-react';
import { useCallContext } from '@/contexts/CallContext';

const joinSchema = z.object({
  username: z
    .string()
    .min(2, 'Username must be at least 2 characters')
    .max(20, 'Too long'),
});

type JoinForm = z.infer<typeof joinSchema>;

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { joinAsUser, currentUser } = useCallContext();

  const params = new URLSearchParams(search);
  const invitedBy = params.get('invite');

  React.useEffect(() => {
    if (currentUser) {
      setLocation('/lobby');
    }
  }, [currentUser, setLocation]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<JoinForm>({
    resolver: zodResolver(joinSchema),
  });

  const onSubmit = (data: JoinForm) => {
    joinAsUser(data.username);
    setLocation('/lobby');
  };

  if (currentUser) return null;

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
      <img
        src="/images/hero-bg.png"
        alt="Abstract background"
        className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-screen"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/20" />

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-primary/20 text-primary mb-6 shadow-2xl shadow-primary/20 backdrop-blur-xl border border-primary/20">
            <Video className="w-10 h-10" />
          </div>

          {invitedBy ? (
            <>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-medium mb-4">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Invite from <span className="font-bold ml-1">{invitedBy}</span>
              </div>
              <h1 className="text-4xl font-display text-white mb-4 drop-shadow-md">
                You're invited!
              </h1>
              <p className="text-lg text-white/60 font-medium">
                <span className="text-white font-semibold">{invitedBy}</span>{' '}
                wants to connect with you. Pick a username to join.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-5xl font-display text-white mb-4 drop-shadow-md">
                Connect Instantly
              </h1>
              <p className="text-lg text-white/60 font-medium">
                Crystal clear calls. No phone number required. Just pick a name
                and jump in.
              </p>
            </>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="glass-panel p-8 rounded-3xl">
          <div className="space-y-6">
            {invitedBy && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
                <UserCircle className="w-8 h-8 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-white/40">Calling with</p>
                  <p className="text-white font-semibold">{invitedBy}</p>
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-white/70 mb-2"
              >
                {invitedBy ? 'Your username' : 'Choose your username'}
              </label>
              <input
                id="username"
                {...register('username')}
                placeholder="e.g. Maverick"
                className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                autoComplete="off"
                autoFocus
              />
              {errors.username && (
                <p className="mt-2 text-sm text-destructive">
                  {errors.username.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full group py-4 px-6 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold text-lg shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200 flex items-center justify-center space-x-2"
            >
              <span>{invitedBy ? 'Join & Connect' : 'Join Network'}</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </form>

        <p className="text-center text-sm text-white/40 mt-8">
          End-to-end encrypted WebRTC connections.
        </p>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Mic, Users, Signal, Search, Video, Link2, Check, LogOut } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCallContext } from '@/contexts/CallContext';

interface OnlineUser {
  username: string;
  socketId: string;
  joinedAt: string;
}

function useOnlineUsers() {
  return useQuery<{ users: OnlineUser[] }>({
    queryKey: ['/api/users/online'],
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/users/online', { signal });
      if (!res.ok) throw new Error('Failed to fetch online users');
      return res.json();
    },
    refetchInterval: 2000,
  });
}

export default function LobbyPage() {
  const [, setLocation] = useLocation();
  const { currentUser, leaveSession, initiateCall } = useCallContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    if (!currentUser) setLocation('/');
  }, [currentUser, setLocation]);

  const { data, isLoading } = useOnlineUsers();

  const allOnlineUsers =
    data?.users.filter((u) => u.username !== currentUser) || [];
  const onlineUsers = searchQuery
    ? allOnlineUsers.filter((u) =>
        u.username.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : allOnlineUsers;

  const copyInviteLink = async () => {
    const url = `${window.location.origin}/?invite=${encodeURIComponent(currentUser || '')}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      prompt('Copy this invite link:', url);
    }
  };

  const handleLeave = () => {
    leaveSession();
    setLocation('/');
  };

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 py-12 relative z-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-16">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
              <Video className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-display text-foreground font-bold">
                Network Directory
              </h1>
              <p className="text-muted-foreground flex items-center mt-1">
                <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                Connected as{' '}
                <span className="text-white ml-1 font-medium">{currentUser}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
            <div className="flex items-center bg-card border border-border rounded-full px-4 py-2 flex-1 min-w-[180px] shadow-sm">
              <Search className="w-5 h-5 text-muted-foreground mr-3 shrink-0" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none text-foreground focus:outline-none w-full placeholder:text-muted-foreground/60"
              />
            </div>
            <button
              onClick={copyInviteLink}
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all duration-200 text-sm font-medium whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  <span>Invite Link</span>
                </>
              )}
            </button>
            <button
              onClick={handleLeave}
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 transition-all duration-200 text-sm font-medium whitespace-nowrap"
              title="Leave session"
            >
              <LogOut className="w-4 h-4" />
              <span>Leave</span>
            </button>
          </div>
        </header>

        <main>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-display font-semibold flex items-center text-white/90">
              <Users className="w-5 h-5 mr-3 text-primary" />
              Online Now ({onlineUsers.length})
            </h2>
            <div className="hidden sm:flex items-center gap-4 text-xs text-white/30">
              <span className="flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" /> Voice
              </span>
              <span className="flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5" /> Video
              </span>
            </div>
          </div>

          {isLoading && onlineUsers.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-card/50 border border-white/5 rounded-2xl p-6 h-32 animate-pulse flex items-center space-x-4"
                >
                  <div className="w-16 h-16 rounded-full bg-white/5" />
                  <div className="space-y-3 flex-1">
                    <div className="h-4 bg-white/5 rounded w-1/2" />
                    <div className="h-3 bg-white/5 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : onlineUsers.length === 0 ? (
            <div className="glass-panel rounded-3xl p-16 text-center flex flex-col items-center">
              <Signal className="w-16 h-16 text-muted-foreground mb-6 opacity-50" />
              <h3 className="text-2xl font-display font-medium text-white mb-2">
                It's quiet here…
              </h3>
              <p className="text-muted-foreground max-w-md mb-8">
                You're the only one online. Share your invite link and the other
                person will appear here instantly.
              </p>
              <button
                onClick={copyInviteLink}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all duration-200 font-medium"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    Link Copied!
                  </>
                ) : (
                  <>
                    <Link2 className="w-5 h-5" />
                    Copy Invite Link
                  </>
                )}
              </button>
              <p className="text-xs text-muted-foreground/60 mt-4">
                Open in another tab or send to a friend to test the call
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {onlineUsers.map((user) => (
                <div
                  key={user.socketId}
                  className="group bg-card hover:bg-card/80 border border-border hover:border-primary/50 rounded-2xl p-6 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-primary/10 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-4 overflow-hidden">
                    <div className="relative shrink-0">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-border flex items-center justify-center text-xl font-display text-white/80 group-hover:border-primary/50 transition-colors">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-green-500 border-2 border-card" />
                    </div>
                    <div className="truncate pr-2">
                      <h3 className="font-semibold text-foreground truncate text-lg">
                        {user.username}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Ready to connect
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => initiateCall(user, 'audio')}
                      title={`Voice call ${user.username}`}
                      className="w-10 h-10 rounded-full bg-green-500/10 text-green-400 flex items-center justify-center hover:bg-green-500 hover:text-white transition-all duration-200 shadow-sm active:scale-95"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => initiateCall(user, 'video')}
                      title={`Video call ${user.username}`}
                      className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all duration-200 shadow-sm active:scale-95"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

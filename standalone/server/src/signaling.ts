import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";

interface OnlineUser {
  username: string;
  socketId: string;
  joinedAt: Date;
}

const onlineUsers = new Map<string, OnlineUser>();

// Rate-limit control events (join, call, answer, etc.) but NOT ice-candidate.
// ICE negotiation generates 20-30 candidates/sec — rate limiting them kills calls.
const joinEventTs = new Map<string, number>();
function isControlRateLimited(socketId: string): boolean {
  const now = Date.now();
  const last = joinEventTs.get(socketId) ?? 0;
  if (now - last < 100) return true; // max 10 control events/second
  joinEventTs.set(socketId, now);
  return false;
}

function sanitizeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9_\-. ]/g, "")
    .slice(0, 20);
  return cleaned.length >= 2 ? cleaned : null;
}

// Socket.io v4 IDs are ~20-char base64url strings
function isValidSocketId(id: unknown): id is string {
  return typeof id === "string" && id.length >= 10 && id.length <= 30;
}

export function getOnlineUsers(): OnlineUser[] {
  return Array.from(onlineUsers.values());
}

export function setupSignaling(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/api/socket.io",
    maxHttpBufferSize: 1e6, // 1 MB — enough for ICE candidates + SDP
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  io.on("connection", (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);
    let joined = false;

    socket.on("join", (rawUsername: unknown) => {
      if (joined || isControlRateLimited(socket.id)) return;
      const username = sanitizeUsername(rawUsername);
      if (!username) return;
      joined = true;
      onlineUsers.set(socket.id, {
        username,
        socketId: socket.id,
        joinedAt: new Date(),
      });
      socket.broadcast.emit("user-joined", {
        username,
        socketId: socket.id,
      });
      console.log(`User joined: ${username} (${socket.id})`);
    });

    socket.on("call-user", (payload: unknown) => {
      if (!joined || isControlRateLimited(socket.id)) return;
      const p = payload as Record<string, unknown>;
      if (!isValidSocketId(p?.to) || typeof p?.offer !== "object") return;
      const caller = onlineUsers.get(socket.id);
      if (!caller || !onlineUsers.has(p.to as string)) return;
      const callType = p?.callType === "audio" ? "audio" : "video";
      io.to(p.to as string).emit("incoming-call", {
        from: socket.id,
        fromUsername: caller.username,
        offer: p.offer,
        callType,
      });
    });

    socket.on("answer-call", (payload: unknown) => {
      if (!joined || isControlRateLimited(socket.id)) return;
      const p = payload as Record<string, unknown>;
      if (!isValidSocketId(p?.to) || typeof p?.answer !== "object") return;
      if (!onlineUsers.has(p.to as string)) return;
      io.to(p.to as string).emit("call-answered", { answer: p.answer });
    });

    // ICE candidates — NOT rate-limited (fire in rapid bursts during negotiation)
    socket.on("ice-candidate", (payload: unknown) => {
      if (!joined) return;
      const p = payload as Record<string, unknown>;
      if (!isValidSocketId(p?.to) || !p?.candidate) return;
      io.to(p.to as string).emit("ice-candidate", {
        candidate: p.candidate,
      });
    });

    socket.on("end-call", (payload: unknown) => {
      if (!joined) return;
      const p = payload as Record<string, unknown>;
      if (!isValidSocketId(p?.to)) return;
      io.to(p.to as string).emit("call-ended");
    });

    socket.on("reject-call", (payload: unknown) => {
      if (!joined) return;
      const p = payload as Record<string, unknown>;
      if (!isValidSocketId(p?.to)) return;
      io.to(p.to as string).emit("call-rejected");
    });

    socket.on("disconnect", () => {
      const user = onlineUsers.get(socket.id);
      if (user) {
        socket.broadcast.emit("user-left", {
          username: user.username,
          socketId: socket.id,
        });
        onlineUsers.delete(socket.id);
        console.log(`User left: ${user.username} (${socket.id})`);
      }
      joinEventTs.delete(socket.id);
    });
  });

  return io;
}

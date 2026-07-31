import { Server as SocketIOServer } from "socket.io";
const onlineUsers = new Map();
const rateLimits = new Map();
function isControlRateLimited(socketId) {
    const now = Date.now();
    let state = rateLimits.get(socketId);
    if (!state) {
        state = { tokens: 5, lastRefill: now };
        rateLimits.set(socketId, state);
    }
    // Refill tokens: 1 token per 200ms (5 tokens/sec max sustained) up to max 5 tokens
    const elapsed = now - state.lastRefill;
    if (elapsed > 200) {
        const refill = Math.floor(elapsed / 200);
        state.tokens = Math.min(5, state.tokens + refill);
        state.lastRefill = now - (elapsed % 200);
    }
    if (state.tokens < 1) {
        return true; // rate limited
    }
    state.tokens -= 1;
    return false;
}
function sanitizeUsername(raw) {
    if (typeof raw !== "string")
        return null;
    const cleaned = raw
        .trim()
        .replace(/[^a-zA-Z0-9_\-. ]/g, "")
        .slice(0, 20);
    return cleaned.length >= 2 ? cleaned : null;
}
// Socket.io v4 IDs are ~20-char base64url strings
function isValidSocketId(id) {
    return typeof id === "string" && id.length >= 10 && id.length <= 30;
}
export function getOnlineUsers() {
    return Array.from(onlineUsers.values());
}
export function setupSignaling(httpServer) {
    const io = new SocketIOServer(httpServer, {
        cors: { origin: "*", methods: ["GET", "POST"] },
        path: "/api/socket.io",
        maxHttpBufferSize: 1e6, // 1 MB — enough for ICE candidates + SDP
        pingTimeout: 30000,
        pingInterval: 25000,
    });
    io.on("connection", (socket) => {
        console.log(`Socket connected: ${socket.id}`);
        let joined = false;
        socket.on("join", (rawUsername) => {
            if (joined || isControlRateLimited(socket.id))
                return;
            const username = sanitizeUsername(rawUsername);
            if (!username)
                return;
            // Evict any existing socket mapping for this username (e.g. from a crashed session)
            for (const [sid, user] of onlineUsers.entries()) {
                if (user.username.toLowerCase() === username.toLowerCase()) {
                    onlineUsers.delete(sid);
                    console.log(`Evicted duplicate/zombie session for user: ${username} (${sid})`);
                }
            }
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
        socket.on("call-user", (payload) => {
            console.log(`[WS Server] call-user received from socket: ${socket.id}`);
            if (!joined) {
                console.warn(`[WS Server] call-user rejected: socket not joined`);
                return;
            }
            if (isControlRateLimited(socket.id)) {
                console.warn(`[WS Server] call-user rejected: rate limited`);
                return;
            }
            const p = payload;
            if (!isValidSocketId(p?.to) || typeof p?.offer !== "object") {
                console.warn(`[WS Server] call-user rejected: invalid payload fields. to: ${p?.to}, offer type: ${typeof p?.offer}`);
                return;
            }
            const caller = onlineUsers.get(socket.id);
            if (!caller) {
                console.warn(`[WS Server] call-user rejected: caller not found in onlineUsers`);
                return;
            }
            if (!onlineUsers.has(p.to)) {
                console.warn(`[WS Server] call-user rejected: target socket ID ${p.to} not online`);
                return;
            }
            const callType = p?.callType === "audio" ? "audio" : "video";
            console.log(`[WS Server] call-user: forwarding incoming-call from ${caller.username} (${socket.id}) to target socket: ${p.to}`);
            io.to(p.to).emit("incoming-call", {
                from: socket.id,
                fromUsername: caller.username,
                offer: p.offer,
                callType,
            });
        });
        socket.on("answer-call", (payload) => {
            console.log(`[WS Server] answer-call received from socket: ${socket.id}`);
            if (!joined)
                return;
            if (isControlRateLimited(socket.id))
                return;
            const p = payload;
            if (!isValidSocketId(p?.to) || typeof p?.answer !== "object")
                return;
            if (!onlineUsers.has(p.to))
                return;
            console.log(`[WS Server] answer-call: forwarding call-answered to target socket: ${p.to}`);
            io.to(p.to).emit("call-answered", { answer: p.answer });
        });
        // ICE candidates — NOT rate-limited (fire in rapid bursts during negotiation)
        socket.on("ice-candidate", (payload) => {
            if (!joined)
                return;
            const p = payload;
            if (!isValidSocketId(p?.to) || !p?.candidate)
                return;
            io.to(p.to).emit("ice-candidate", {
                candidate: p.candidate,
            });
        });
        socket.on("end-call", (payload) => {
            if (!joined)
                return;
            const p = payload;
            if (!isValidSocketId(p?.to))
                return;
            io.to(p.to).emit("call-ended");
        });
        socket.on("reject-call", (payload) => {
            if (!joined)
                return;
            const p = payload;
            if (!isValidSocketId(p?.to))
                return;
            io.to(p.to).emit("call-rejected");
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
            rateLimits.delete(socket.id);
        });
    });
    return io;
}
//# sourceMappingURL=signaling.js.map
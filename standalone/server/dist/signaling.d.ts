import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
interface OnlineUser {
    username: string;
    socketId: string;
    joinedAt: Date;
}
export declare function getOnlineUsers(): OnlineUser[];
export declare function setupSignaling(httpServer: HttpServer): SocketIOServer;
export {};
//# sourceMappingURL=signaling.d.ts.map
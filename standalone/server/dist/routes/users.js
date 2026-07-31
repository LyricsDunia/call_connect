import { Router } from "express";
import { getOnlineUsers } from "../signaling.js";
const router = Router();
router.get("/online", (_req, res) => {
    const users = getOnlineUsers().map((u) => ({
        username: u.username,
        socketId: u.socketId,
        joinedAt: u.joinedAt.toISOString(),
    }));
    res.json({ users });
});
export default router;
//# sourceMappingURL=users.js.map
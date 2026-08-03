import { Router } from "express";
import healthRouter from "./health.js";
import usersRouter from "./users.js";
const router = Router();
router.use(healthRouter);
router.use("/users", usersRouter);
router.get("/ice-servers", async (_req, res) => {
    const ident = process.env["XIRSYS_IDENT"];
    const secret = process.env["XIRSYS_SECRET"];
    const channel = process.env["XIRSYS_CHANNEL"] || "default";
    const defaultIce = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun3.l.google.com:19302" },
            { urls: "stun:stun4.l.google.com:19302" },
            {
                urls: [
                    "turn:openrelay.metered.ca:80",
                    "turn:openrelay.metered.ca:443",
                    "turns:openrelay.metered.ca:443?transport=tcp",
                ],
                username: "openrelayproject",
                credential: "openrelayproject",
            },
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
    };
    if (ident && secret) {
        try {
            console.log(`[Xirsys] Fetching TURN credentials for channel: ${channel}`);
            const auth = Buffer.from(`${ident}:${secret}`).toString("base64");
            const response = await fetch(`https://global.xirsys.net/_turn/${channel}`, {
                method: "PUT",
                headers: {
                    "Authorization": `Basic ${auth}`,
                    "Content-Type": "application/json",
                },
            });
            if (response.ok) {
                const data = (await response.json());
                if (data && data.v && data.v.iceServers) {
                    console.log("[Xirsys] Successfully fetched dynamic TURN credentials.");
                    return res.json({
                        iceServers: data.v.iceServers,
                        iceCandidatePoolSize: 10,
                        bundlePolicy: "max-bundle",
                        rtcpMuxPolicy: "require",
                    });
                }
            }
            console.warn(`[Xirsys] API returned status ${response.status}. Falling back to default ICE.`);
        }
        catch (e) {
            console.error("[Xirsys] Error fetching TURN credentials, falling back:", e);
        }
    }
    res.json(defaultIce);
});
export default router;
//# sourceMappingURL=index.js.map
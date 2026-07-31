import { Router } from "express";
import healthRouter from "./health.js";
import usersRouter from "./users.js";
const router = Router();
router.use(healthRouter);
router.use("/users", usersRouter);
export default router;
//# sourceMappingURL=index.js.map
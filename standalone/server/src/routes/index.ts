import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import usersRouter from "./users.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/users", usersRouter);

export default router;

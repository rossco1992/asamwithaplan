import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import timelinesRouter from "./timelines";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/users", usersRouter);
router.use("/timelines", timelinesRouter);

export default router;

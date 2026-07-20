import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import timelinesRouter from "./timelines";
import quotesRouter from "./quotes";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/users", usersRouter);
router.use("/timelines", timelinesRouter);
router.use("/quotes", quotesRouter);

export default router;

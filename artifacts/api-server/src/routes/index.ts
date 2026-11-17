import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import timelinesRouter from "./timelines";
import quotesRouter from "./quotes";
import milestonesRouter from "./milestones";
import weddingsRouter from "./weddings";
import invitesRouter from "./invites";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/users", usersRouter);
router.use("/timelines", timelinesRouter);
router.use("/quotes", quotesRouter);
router.use("/weddings/:weddingId/milestones", milestonesRouter);
router.use("/weddings", weddingsRouter);
router.use("/invites", invitesRouter);

export default router;

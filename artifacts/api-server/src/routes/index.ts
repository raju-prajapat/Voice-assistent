import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/openai", openaiRouter);

export default router;

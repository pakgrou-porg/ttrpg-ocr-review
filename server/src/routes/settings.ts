import { Router } from "express";
import { getSettings, updateSettings } from "../config.js";

const router = Router();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ah(fn: (...args: any[]) => Promise<void>): (...args: any[]) => void {
  return (...args) => { fn(...args).catch(args[2]); };
}

router.get("/", ah(async (_req, res) => {
  res.json(await getSettings());
}));

router.put("/", ah(async (req, res) => {
  res.json(await updateSettings(req.body ?? {}));
}));

export default router;

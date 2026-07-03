import { Router } from "express";
import { getSettings, updateSettings } from "../config.js";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await getSettings());
});

router.put("/", async (req, res) => {
  res.json(await updateSettings(req.body ?? {}));
});

export default router;

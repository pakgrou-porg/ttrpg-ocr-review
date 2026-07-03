import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { MulterError } from "multer";
import documentsRouter from "./routes/documents.js";
import providersRouter from "./routes/providers.js";
import settingsRouter from "./routes/settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Deliberately not process.env.PORT: that var is commonly set by whatever
// launched the client dev server (port 5173) and would collide with it,
// since this backend and the Vite client run as sibling processes sharing
// the same environment under `pnpm dev`.
const PORT = Number(process.env.SERVER_PORT ?? 4100);

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/documents", documentsRouter);
app.use("/api/providers", providersRouter);
app.use("/api/settings", settingsRouter);

// Serves the built client (present after `pnpm build`); in dev the client
// runs under its own Vite server and proxies /api here instead.
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    next();
    return;
  }
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "File too large (1GB limit). Split the PDF or raise the limit in server/src/routes/documents.ts." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`ttrpg-ocr-review server listening on http://127.0.0.1:${PORT}`);
});

import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { importRouter, importErrorHandler } from "./routes/import";
import { getAiConfig } from "./services/aiClient";
import { requestLogger } from "./utils/requestLogger";

const app = express();
const PORT = Number(process.env.PORT || 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

app.use(
  cors({
    origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN.split(","),
  })
);
app.use(express.json());
// Logs every request (method, path, status, duration) so you can see in the
// terminal whether a request even reached the server, and how it resolved -
// this is the first place to look when the frontend just says "something
// went wrong" with no other detail.
app.use(requestLogger);

app.get("/", (_req: Request, res: Response) => {
  res.json({ name: "groweasy-csv-importer-backend", status: "running" });
});

app.use("/api/import", importRouter);
app.use("/api/import", importErrorHandler);

// Global fallback handlers
app.use((req: Request, res: Response) => {
  console.warn(`[server] 404 - no route matched ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: "Not found." });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[server] unhandled error on ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  const { provider, anthropicModel, openaiModel, geminiModel, anthropicKey, openaiKey, geminiKey } =
    getAiConfig();
  const activeModel =
    provider === "anthropic" ? anthropicModel : provider === "openai" ? openaiModel : geminiModel;
  const activeKeySet =
    provider === "anthropic" ? Boolean(anthropicKey) : provider === "openai" ? Boolean(openaiKey) : Boolean(geminiKey);

  console.log(`GrowEasy CSV Importer backend listening on http://localhost:${PORT}`);
  console.log(`[config] AI_PROVIDER=${provider} model=${activeModel} apiKeySet=${activeKeySet}`);
  if (!activeKeySet) {
    console.warn(
      `[config] WARNING: no API key set for provider "${provider}" - every AI extraction call will fail until one is added to backend/.env`
    );
  }
});

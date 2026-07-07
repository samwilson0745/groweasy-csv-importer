import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { parseCsv, CsvParseError } from "../services/csvParser";
import { extractCrmRecords } from "../services/aiExtractor";
import { getAiConfig } from "../services/aiClient";
import { guardConnection } from "../utils/connectionGuard";
import { numFromEnv } from "../utils/env";

// A backstop, not the primary timeout - the frontend has its own
// NEXT_PUBLIC_API_TIMEOUT_MS and gives up client-side first in normal use.
// This exists for direct API callers (curl, another client) and to make
// sure the server itself never hangs on a request indefinitely: instead of
// the connection sitting open forever (or a hosting platform's own proxy
// resetting it abruptly), the client gets one clean JSON error back.
const CONFIRM_TIMEOUT_MS = numFromEnv("IMPORT_ROUTE_TIMEOUT_MS", 150_000, 10_000, 600_000);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const isCsv =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.toLowerCase().endsWith(".csv");
    if (!isCsv) {
      cb(new Error("Only .csv files are supported."));
      return;
    }
    cb(null, true);
  },
});

export const importRouter = Router();

/**
 * GET /api/import/health
 * Lightweight check that also reports which AI provider is configured,
 * without leaking the API key itself.
 */
importRouter.get("/health", (_req: Request, res: Response) => {
  const { provider } = getAiConfig();
  res.json({ status: "ok", aiProvider: provider });
});

/**
 * POST /api/import/preview
 * Parses the CSV only (no AI call) and returns headers + rows so the
 * frontend can render the Step 2 preview table. Mirrors what the frontend
 * could do with a CSV library directly, but also validates the file format.
 */
importRouter.post(
  "/preview",
  upload.single("file"),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        console.warn("[import/preview] rejected: no file in the request (field name must be \"file\")");
        return res.status(400).json({ error: "No CSV file was uploaded." });
      }
      const csvText = req.file.buffer.toString("utf-8");
      const { headers, rows } = parseCsv(csvText);
      if (rows.length === 0) {
        console.warn(`[import/preview] "${req.file.originalname}" parsed to 0 data rows`);
        return res.status(400).json({ error: "The CSV file has no data rows." });
      }
      console.log(`[import/preview] "${req.file.originalname}" -> ${rows.length} row(s), ${headers.length} header(s)`);
      res.json({ headers, rows, totalRows: rows.length });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/import/confirm
 * Full pipeline: parse CSV -> batch -> AI extraction -> structured JSON.
 * This is only ever called after the user clicks "Confirm" on the frontend.
 */
importRouter.post(
  "/confirm",
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    const guard = guardConnection(
      req,
      res,
      CONFIRM_TIMEOUT_MS,
      "The import took too long and was stopped. Try a smaller file, or a larger AI_MAX_CONCURRENT_BATCHES / smaller AI_BATCH_SIZE."
    );

    try {
      if (!req.file) {
        console.warn("[import/confirm] rejected: no file in the request (field name must be \"file\")");
        if (!guard.isSettled()) {
          guard.settle();
          res.status(400).json({ error: "No CSV file was uploaded." });
        }
        return;
      }

      console.log(
        `[import/confirm] received "${req.file.originalname}" (${req.file.size} bytes)`
      );

      const csvText = req.file.buffer.toString("utf-8");
      const { rows } = parseCsv(csvText);

      if (rows.length === 0) {
        console.warn(`[import/confirm] "${req.file.originalname}" parsed to 0 data rows`);
        if (!guard.isSettled()) {
          guard.settle();
          res.status(400).json({ error: "The CSV file has no data rows." });
        }
        return;
      }

      const { provider } = getAiConfig();
      console.log(`[import/confirm] parsed ${rows.length} row(s), starting AI extraction via "${provider}"...`);

      const result = await extractCrmRecords(rows);

      console.log(
        `[import/confirm] done: ${result.totalImported} imported, ${result.totalSkipped} skipped, ${result.batches} batch(es)`
      );

      // The timeout may have already fired, or the client may already be
      // gone, while extractCrmRecords was still running - in either case
      // the response was already claimed (or the socket is dead), so the
      // result is simply discarded instead of trying to write again.
      if (!guard.isSettled()) {
        guard.settle();
        res.json(result);
      } else {
        const cause = guard.wasClientDisconnect() ? "client disconnected" : "request timed out";
        console.warn(`[import/confirm] result ready but discarded - ${cause} before it could be sent.`);
      }
    } catch (err) {
      if (!guard.isSettled()) {
        guard.settle();
        next(err);
      }
    } finally {
      guard.dispose();
    }
  }
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function importErrorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const context = `${req.method} ${req.originalUrl}`;

  if (err instanceof CsvParseError) {
    console.warn(`[import] ${context} - CSV rejected: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof multer.MulterError) {
    console.warn(`[import] ${context} - upload rejected: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof Error) {
    console.error(`[import] ${context} - unexpected error:`, err);
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
  console.error(`[import] ${context} - unknown error:`, err);
  return res.status(500).json({ error: "Internal server error." });
}

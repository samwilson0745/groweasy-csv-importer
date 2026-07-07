"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CsvDropzone } from "@/components/CsvDropzone";
import { PreviewTable } from "@/components/PreviewTable";
import { ResultsTable } from "@/components/ResultsTable";
import { StepIndicator } from "@/components/StepIndicator";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ApiError, confirmImport } from "@/lib/api";
import { ClientCsvError, ParsedCsv, parseCsvFile } from "@/lib/csvParseClient";
import { AppStep, ImportResult } from "@/lib/types";

const PROCESSING_MESSAGES = [
  "Uploading your CSV to the server...",
  "Parsing rows and preparing AI batches...",
  "Mapping columns into GrowEasy CRM fields...",
  "Validating statuses, sources, and dates...",
  "Almost done, finalizing results...",
];

export default function Home() {
  const [step, setStep] = useState<AppStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [processingMessageIndex, setProcessingMessageIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (step === "processing") {
      setProcessingMessageIndex(0);
      intervalRef.current = setInterval(() => {
        setProcessingMessageIndex((i) => Math.min(i + 1, PROCESSING_MESSAGES.length - 1));
      }, 1400);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [step]);

  const handleFileSelected = useCallback(async (selected: File) => {
    setError(null);
    setUploadBusy(true);
    try {
      const parsedCsv = await parseCsvFile(selected);
      setFile(selected);
      setParsed(parsedCsv);
      setStep("preview");
    } catch (err) {
      // Logged so the browser DevTools console shows the real cause, not
      // just the friendly on-screen message.
      console.error("[groweasy] failed to parse CSV file:", err);
      const message = err instanceof ClientCsvError ? err.message : "Failed to read this CSV file.";
      setError(message);
    } finally {
      setUploadBusy(false);
    }
  }, []);

  async function handleConfirm() {
    if (!file) return;
    setError(null);
    setStep("processing");
    try {
      const res = await confirmImport(file);
      setResult(res);
      setStep("results");
    } catch (err) {
      // Logged so the browser DevTools console shows the real cause, not
      // just the friendly on-screen message.
      console.error("[groweasy] import failed:", err);
      const message = err instanceof ApiError ? err.message : "Something went wrong during import.";
      setError(message);
      setStep("preview");
    }
  }

  function handleReset() {
    setFile(null);
    setParsed(null);
    setResult(null);
    setError(null);
    setStep("upload");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400">
            GrowEasy
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">AI CSV Lead Importer</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Upload any lead export - Facebook, Google Ads, a CRM dump, or a manual spreadsheet - and let
            AI map it into GrowEasy CRM format automatically.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <StepIndicator current={step} />
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-5 w-5 shrink-0" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
          </svg>
          <div>
            <p className="font-semibold">Something went wrong</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        {step === "upload" && (
          <div className="space-y-4">
            <CsvDropzone onFileSelected={handleFileSelected} disabled={uploadBusy} />
            {uploadBusy && (
              <p className="text-center text-sm text-slate-500 dark:text-slate-400">Reading file...</p>
            )}
          </div>
        )}

        {step === "preview" && parsed && (
          <div className="space-y-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold">Preview: {file?.name}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {parsed.rows.length} row(s) &middot; {parsed.headers.length} column(s) detected. Nothing has
                  been sent to AI yet.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Choose a different file
                </button>
                <button
                  onClick={handleConfirm}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
                >
                  Confirm Import
                </button>
              </div>
            </div>
            <PreviewTable headers={parsed.headers} rows={parsed.rows} />
          </div>
        )}

        {step === "processing" && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">Running AI extraction...</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {PROCESSING_MESSAGES[processingMessageIndex]}
              </p>
            </div>
          </div>
        )}

        {step === "results" && result && (
          <div className="space-y-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold">Import Results</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {result.totalImported} of {result.totalRows} rows imported successfully.
                </p>
              </div>
              <button
                onClick={handleReset}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Import another file
              </button>
            </div>
            <ResultsTable result={result} />
          </div>
        )}
      </section>

      <footer className="pb-6 text-center text-xs text-slate-400 dark:text-slate-600">
        Built for the GrowEasy Software Developer assignment.
      </footer>
    </main>
  );
}

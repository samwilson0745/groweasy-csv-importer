"use client";

import { useCallback, useRef, useState } from "react";

interface CsvDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function CsvDropzone({ onFileSelected, disabled }: CsvDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0 || disabled) return;
      onFileSelected(files[0]);
    },
    [onFileSelected, disabled]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload CSV file"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors sm:p-16 ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      } ${
        isDragging
          ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
          : "border-slate-300 bg-white hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-500/70 dark:hover:bg-brand-900/10"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600 transition group-hover:scale-105 dark:bg-brand-900/40 dark:text-brand-300">
        <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth={1.75}>
          <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
          Drop your CSV file here
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          or click to browse &middot; Facebook, Google Ads, CRM exports, spreadsheets - any layout works
        </p>
      </div>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        Supported file: .csv (max 10MB)
      </span>
    </div>
  );
}

"use client";

import { FileDown, FileText } from "lucide-react";

export function PdfCard({ title, url }: { title: string; url: string }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden max-w-md">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="rounded-lg bg-accent/10 p-2">
          <FileText className="h-5 w-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{title}</div>
          <div className="text-xs text-muted-foreground">PDF report</div>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity shrink-0"
        >
          <FileDown className="h-3.5 w-3.5" />
          Download
        </a>
      </div>
      {/* Inline preview via the browser's native PDF viewer in an iframe */}
      <iframe src={url} className="w-full h-64 border-t border-border" title={title} />
    </div>
  );
}

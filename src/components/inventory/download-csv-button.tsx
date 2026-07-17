"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DownloadCsvButton({
  csv,
  filename,
}: {
  csv: string;
  filename: string;
}) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={download}>
      <Download className="mr-1.5 size-4" /> Download CSV
    </Button>
  );
}

import { TriangleAlert, Info, CircleCheck } from "lucide-react";
import type { Violation } from "@/types/domain";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function ViolationsBanner({ violations }: { violations: Violation[] }) {
  if (violations.length === 0) {
    return (
      <Alert>
        <CircleCheck className="size-4" />
        <AlertTitle>No rule violations</AlertTitle>
        <AlertDescription>This week is clear to publish.</AlertDescription>
      </Alert>
    );
  }

  const blockers = violations.filter((v) => v.level === "block");
  const warnings = violations.filter((v) => v.level === "warn");
  // Blockers first, then warnings.
  const ordered = [...blockers, ...warnings];
  const shown = ordered.slice(0, 12);
  const extra = ordered.length - shown.length;

  return (
    <Alert variant={blockers.length > 0 ? "destructive" : "default"}>
      {blockers.length > 0 ? (
        <TriangleAlert className="size-4" />
      ) : (
        <Info className="size-4" />
      )}
      <AlertTitle>
        {plural(blockers.length, "blocker")} · {plural(warnings.length, "warning")}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto">
          {shown.map((v, i) => (
            <li key={i} className="flex items-center gap-2">
              {v.level === "block" ? (
                <TriangleAlert className="text-destructive size-3.5 shrink-0" />
              ) : (
                <Info className="text-muted-foreground size-3.5 shrink-0" />
              )}
              <span>{v.message}</span>
            </li>
          ))}
          {extra > 0 && (
            <li className="text-muted-foreground">+{extra} more…</li>
          )}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

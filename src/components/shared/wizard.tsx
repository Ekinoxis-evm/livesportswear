"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Presentational multi-step shell: progress pills, a keyed content pane with
 * a fade/slide transition, and Back / Next-or-Finish footer. The consumer
 * owns the step index and all field state; `validate` gates leaving a step
 * forward (an RHF `trigger(fields)` slots straight in). Completed pills are
 * clickable to go back — never forward past validation.
 */
export type WizardStep = {
  title: string;
  content: React.ReactNode;
  validate?: () => boolean | Promise<boolean>;
};

export function Wizard({
  steps,
  step,
  onStepChange,
  onFinish,
  finishLabel = "Finish",
  pending = false,
  pendingLabel = "Saving…",
}: {
  steps: WizardStep[];
  step: number;
  onStepChange: (step: number) => void;
  onFinish: () => void;
  finishLabel?: string;
  pending?: boolean;
  pendingLabel?: string;
}) {
  const last = step === steps.length - 1;

  async function next() {
    const ok = (await steps[step].validate?.()) ?? true;
    if (!ok) return;
    if (last) onFinish();
    else onStepChange(step + 1);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ol className="flex flex-wrap items-center gap-1.5">
        {steps.map((s, i) => {
          const state = i === step ? "current" : i < step ? "done" : "todo";
          return (
            <li key={s.title} className="flex items-center gap-1.5">
              {i > 0 && <span className="bg-border h-px w-3" aria-hidden />}
              <button
                type="button"
                disabled={state !== "done" || pending}
                onClick={() => onStepChange(i)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  state === "current" && "bg-primary text-primary-foreground",
                  state === "done" && "bg-muted hover:bg-muted/70",
                  state === "todo" && "text-muted-foreground",
                )}
              >
                {i + 1}. {s.title}
              </button>
            </li>
          );
        })}
      </ol>

      <div
        key={step}
        className="animate-in fade-in slide-in-from-right-2 min-h-0 flex-1 overflow-y-auto duration-200"
      >
        {steps[step].content}
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={step === 0 || pending}
          onClick={() => onStepChange(step - 1)}
        >
          Back
        </Button>
        <Button size="sm" disabled={pending} onClick={next}>
          {pending ? pendingLabel : last ? finishLabel : "Next"}
        </Button>
      </div>
    </div>
  );
}

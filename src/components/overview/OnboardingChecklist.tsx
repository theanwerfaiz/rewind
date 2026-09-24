"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import type { OnboardingStep } from "@/lib/onboarding";

const DISMISSED_KEY = "rewind.onboarding.dismissed";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function isDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Storage unavailable: hidden until the next page load.
  }

  for (const listener of listeners) {
    listener();
  }
}

/** Setup progress, each step checked against real data. Hidden when done. */
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  // Hidden on the server and until storage is read, so it never flashes.
  const dismissed = useSyncExternalStore(subscribe, isDismissed, () => true);

  const done = steps.filter((step) => step.done).length;

  if (dismissed || done === steps.length) {
    return null;
  }

  const next = steps.find((step) => !step.done);

  return (
    <section
      aria-label="Get started"
      className="mb-6 overflow-hidden rounded-xl border border-accent/25 bg-panel"
    >
      <div className="flex items-center gap-4 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-ink">Get started with Rewind</h2>

          <p className="mt-0.5 text-sm text-muted">
            {done} of {steps.length} done
            {next ? ` · next: ${next.title.toLowerCase()}` : ""}
          </p>
        </div>

        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
          aria-label="Setup progress"
          className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-raised sm:block"
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide the setup checklist"
          className="rounded-md p-1 text-muted hover:bg-raised hover:text-ink"
        >
          <X size={15} />
        </button>
      </div>

      <ol className="grid sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.id} className="border-b border-line sm:border-r">
            <Link
              href={step.href}
              className="flex h-full items-start gap-3 px-4 py-3 transition hover:bg-raised"
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                  step.done
                    ? "border-success bg-success text-canvas"
                    : step === next
                      ? "border-accent text-accent"
                      : "border-line-strong text-muted"
                }`}
              >
                {step.done ? <Check size={12} strokeWidth={3} /> : index + 1}
              </span>

              <span className="min-w-0">
                <span
                  className={`block text-sm ${
                    step.done ? "text-muted line-through decoration-faint" : "text-ink"
                  }`}
                >
                  {step.title}
                </span>

                <span className="mt-0.5 block text-xs text-muted">{step.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

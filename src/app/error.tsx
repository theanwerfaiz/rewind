"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { buttonClass, EmptyState } from "@/components/ui/primitives";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={<TriangleAlert size={28} className="text-failure" />}
      title="This page could not load"
      action={
        <button type="button" onClick={() => retry()} className={buttonClass("primary")}>
          Try again
        </button>
      }
    >
      Rewind hit an error while reading its data. The details are in the
      server log{error.digest ? ` (reference ${error.digest})` : ""}.
    </EmptyState>
  );
}

import { SearchX } from "lucide-react";

import { ButtonLink, EmptyState } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <EmptyState
      icon={<SearchX size={28} />}
      title="Nothing here"
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <ButtonLink href="/" variant="primary">
            Go to overview
          </ButtonLink>
          <ButtonLink href="/executions">Executions</ButtonLink>
        </div>
      }
    >
      This execution, event or page does not exist in this Rewind. It may have
      been captured by another instance: import its capsule to see it here.
    </EmptyState>
  );
}

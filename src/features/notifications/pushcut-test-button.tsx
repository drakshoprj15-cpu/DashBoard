"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";

import {
  testPushcutAction,
  type PushcutActionResult,
} from "@/features/notifications/pushcut-actions";
import type { PushcutSlotKey } from "@/features/notifications/pushcut-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PushcutTestButtonProps {
  slot: PushcutSlotKey;
  label: string;
}

export function PushcutTestButton({ slot, label }: PushcutTestButtonProps) {
  const [state, action, pending] = useActionState<
    PushcutActionResult | null,
    FormData
  >(testPushcutAction, null);

  return (
    <div className="flex flex-col gap-1.5">
      <form action={action}>
        <input type="hidden" name="slot" value={slot} />
        <Button size="sm" variant="outline" type="submit" loading={pending}>
          <Send /> Testar {label.toLowerCase()}
        </Button>
      </form>
      {state && (
        <p
          className={cn(
            "max-w-72 text-xs",
            state.ok ? "text-success" : "text-destructive",
          )}
          role={state.ok ? "status" : "alert"}
        >
          {state.message ?? state.error}
        </p>
      )}
    </div>
  );
}

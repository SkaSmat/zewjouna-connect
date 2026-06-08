import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
}

/** A classic dropdown menu (Bumble-style) for picking several values. */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Sélectionner",
  max,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((t) => t !== opt));
    } else {
      if (max && selected.length >= max) return;
      onChange([...selected, opt]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3.5 py-3 text-left text-sm transition-colors hover:border-primary/40"
        >
          <span
            className={cn(
              "flex flex-wrap gap-1.5",
              selected.length === 0 && "text-muted-foreground",
            )}
          >
            {selected.length === 0
              ? placeholder
              : selected.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {s}
                  </span>
                ))}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-64 w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-2xl p-1"
      >
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors hover:bg-muted",
                active && "font-medium",
              )}
            >
              {opt}
              {active && <Check className="h-4 w-4 text-primary" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

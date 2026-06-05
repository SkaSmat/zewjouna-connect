import { cn } from "@/lib/utils";

interface TagSelectorProps {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  max?: number;
}

export function TagSelector({ options, selected, onChange, max }: TagSelectorProps) {
  const toggle = (tag: string) => {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
    } else {
      if (max && selected.length >= max) return;
      onChange([...selected, tag]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            aria-pressed={active}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all active:scale-95",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-soft"
                : "border-border bg-card text-foreground hover:border-primary/40",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

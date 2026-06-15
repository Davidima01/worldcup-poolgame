import { ShieldAlert } from "lucide-react";

export function AdminBadge({ at }: { at?: string | null }) {
  const title = at ? `Admin edited ${new Date(at).toLocaleString()}` : "Admin edited";
  return (
    <span
      title={title}
      className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-px text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300"
    >
      <ShieldAlert className="h-2.5 w-2.5" />
      admin
    </span>
  );
}
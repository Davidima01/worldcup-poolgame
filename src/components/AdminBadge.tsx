import { ShieldAlert } from "lucide-react";

export function AdminBadge({ at }: { at?: string | null }) {
  const title = at ? `Admin edited · ${new Date(at).toLocaleString()}` : "Admin edited";
  return (
    <span
      title={title}
      className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
    >
      <ShieldAlert className="h-2.5 w-2.5" />
      Admin
    </span>
  );
}
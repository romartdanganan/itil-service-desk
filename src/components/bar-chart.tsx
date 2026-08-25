// A plain, server-rendered horizontal bar: no charting library, no client
// JS, a percentage-width div is enough to show relative scale at a
// glance. Same "HTML over a bundle" approach the rest of this app
// already uses everywhere else.

export function BarRow({
  label,
  value,
  displayValue,
  max,
  tone = "neutral",
}: {
  label: string;
  value: number;
  displayValue?: string;
  max: number;
  tone?: "neutral" | "danger" | "success" | "warning";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "bg-zinc-400 dark:bg-zinc-600",
    danger: "bg-red-500",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
  };
  // A non-zero value with a 0% bar reads as "no data", not "zero", so
  // anything above zero gets a small minimum width to stay visible.
  const widthPct = max > 0 ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0 truncate text-zinc-600 dark:text-zinc-400">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className={`h-2 rounded-full ${toneClasses[tone]}`} style={{ width: `${widthPct}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {displayValue ?? value}
      </span>
    </div>
  );
}

export function ReportCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">{title}</h2>
      {children}
    </div>
  );
}

export function StatBlock({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger" | "success" | "warning";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "text-black dark:text-zinc-50",
    danger: "text-red-700 dark:text-red-400",
    success: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
  };
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={`text-lg font-semibold ${toneClasses[tone]}`}>{value}</span>
    </div>
  );
}

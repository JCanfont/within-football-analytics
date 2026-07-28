import type { LucideIcon } from "lucide-react";

type MetricCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
};

export function MetricCard({ icon: Icon, label, value, detail }: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-icon">
        <Icon size={19} aria-hidden="true" />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

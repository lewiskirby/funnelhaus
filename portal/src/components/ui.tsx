import type { ReactNode, SVGProps } from "react";
import type { Client, TaskStatus } from "@/lib/types";

// ── Brand ────────────────────────────────────────────

export function LogoMark({ className = "h-6 w-auto", color = "#700000" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 214.17 287.44" className={className} aria-hidden="true">
      <path fill={color} d="M8.17,160.29v-69.51L107.08,9.09l98.92,81.7v69.51H8.17ZM32.17,102.09v34.19h149.83v-34.19l-74.92-61.87-74.92,61.87Z" />
      <path fill={color} d="M13.77,183.72h186.64l-93.32,94.13L13.77,183.72ZM107.09,243.76l35.73-36.04h-71.45l35.73,36.04Z" />
    </svg>
  );
}

/** The client's Notion page icon (emoji or image), falling back to initials. */
export function ClientAvatar({ client, className = "size-10 rounded-xl" }: { client: Pick<Client, "name" | "icon">; className?: string }) {
  const icon = client.icon;
  if (icon?.type === "image") {
    return (
      <span className={`flex shrink-0 items-center justify-center overflow-hidden ${className}`}>
        {/* Notion file URLs are signed and short-lived, so skip next/image caching. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon.url} alt="" className="size-full object-cover" />
      </span>
    );
  }
  if (icon?.type === "emoji") {
    return <span className={`flex shrink-0 items-center justify-center text-2xl ${className}`}>{icon.value}</span>;
  }
  const initials = client.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return <span className={`flex shrink-0 items-center justify-center bg-ink text-sm font-semibold text-white ${className}`}>{initials}</span>;
}

// ── Icons (1.6px stroke, 20px grid) ──────────────────

type IconProps = SVGProps<SVGSVGElement>;
const base = (props: IconProps) => ({
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export const Icon = {
  home: (p: IconProps) => (
    <svg {...base(p)}><path d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1V8.5Z" /></svg>
  ),
  tasks: (p: IconProps) => (
    <svg {...base(p)}><path d="M8 5h9M8 10h9M8 15h9" /><path d="m2.5 5 1.2 1.2L6 4M2.5 10l1.2 1.2L6 9M2.5 15l1.2 1.2L6 14" /></svg>
  ),
  wand: (p: IconProps) => (
    <svg {...base(p)}><path d="M3.5 16.5 12 8" /><path d="m11 6.5 2.5 2.5" /><path d="M14.5 2.5v2M14.5 7.5v2M11 6h-2M20 6h-2M16.8 3.7l-1.1 1.1M16.8 8.3l-1.1-1.1" /></svg>
  ),
  users: (p: IconProps) => (
    <svg {...base(p)}><circle cx="7.5" cy="7" r="3" /><path d="M2 16.5c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5" /><path d="M13 4.2a3 3 0 0 1 0 5.6M15 12.3c1.8.6 3 2 3 4.2" /></svg>
  ),
  chart: (p: IconProps) => (
    <svg {...base(p)}><path d="M3 17h14" /><path d="M5.5 13.5v-3M10 13.5V6M14.5 13.5v-5" /></svg>
  ),
  link: (p: IconProps) => (
    <svg {...base(p)}><path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1" /><path d="M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1" /></svg>
  ),
  arrowRight: (p: IconProps) => (
    <svg {...base(p)}><path d="M4 10h12M11 5l5 5-5 5" /></svg>
  ),
  arrowLeft: (p: IconProps) => (
    <svg {...base(p)}><path d="M16 10H4M9 5l-5 5 5 5" /></svg>
  ),
  external: (p: IconProps) => (
    <svg {...base(p)}><path d="M11 3h6v6M17 3l-8 8M14 12v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" /></svg>
  ),
  check: (p: IconProps) => (
    <svg {...base(p)}><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>
  ),
  clock: (p: IconProps) => (
    <svg {...base(p)}><circle cx="10" cy="10" r="7" /><path d="M10 6.5V10l2.5 1.5" /></svg>
  ),
  calendar: (p: IconProps) => (
    <svg {...base(p)}><rect x="3" y="4.5" width="14" height="12.5" rx="2" /><path d="M3 8.5h14M7 3v3M13 3v3" /></svg>
  ),
  logout: (p: IconProps) => (
    <svg {...base(p)}><path d="M12 4h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3M8 14l-4-4 4-4M4 10h9" /></svg>
  ),
  chat: (p: IconProps) => (
    <svg {...base(p)}><path d="M4 15.5 3 18l3-1.2A7.5 7.5 0 1 0 3.2 12" /></svg>
  ),
  target: (p: IconProps) => (
    <svg {...base(p)}><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3.5" /><circle cx="10" cy="10" r=".5" fill="currentColor" /></svg>
  ),
  chevronRight: (p: IconProps) => (
    <svg {...base(p)}><path d="m8 5 5 5-5 5" /></svg>
  ),
};

// ── Status ───────────────────────────────────────────

export function StatusDot({ status, size = "sm", className = "" }: { status: TaskStatus; size?: "sm" | "lg"; className?: string }) {
  const box = size === "lg" ? "size-8" : "size-5";
  if (status === "Complete") {
    return (
      <span className={`inline-flex ${box} shrink-0 items-center justify-center rounded-full bg-brand text-white ${className}`}>
        <Icon.check className={size === "lg" ? "size-5" : "size-3.5"} strokeWidth={2.2} />
      </span>
    );
  }
  if (status === "In Progress") {
    return (
      <span className={`relative inline-flex ${box} shrink-0 rounded-full border-[1.6px] border-brand ${className}`}>
        <span className={`absolute rounded-full bg-brand [clip-path:inset(0_50%_0_0)] ${size === "lg" ? "inset-[5px]" : "inset-[3px]"}`} />
      </span>
    );
  }
  return <span className={`inline-flex ${box} shrink-0 rounded-full border-[1.6px] border-faint ${className}`} />;
}

// ── Layout helpers ───────────────────────────────────

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-[13px] font-semibold text-muted">{title}</h2>
      {action}
    </div>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-white/10 ${className}`}>
      <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

// ── Formatting ───────────────────────────────────────

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
}

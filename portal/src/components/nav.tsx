"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";

const items = [
  { href: "/", label: "Home", icon: Icon.home },
  { href: "/tasks", label: "Tasks", icon: Icon.tasks },
  { href: "/results", label: "Results", icon: Icon.chart },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ openTasks }: { openTasks: number }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {items.map(({ href, label, icon: ItemIcon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-medium transition ${
              active ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-line" : "text-muted hover:bg-white/60 hover:text-ink"
            }`}
          >
            <ItemIcon className={`size-[18px] ${active ? "text-brand" : "text-faint group-hover:text-muted"}`} />
            <span className="flex-1">{label}</span>
            {href === "/tasks" && openTasks > 0 && (
              <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">{openTasks}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ openTasks }: { openTasks: number }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-3">
        {items.map(({ href, label, icon: ItemIcon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? "text-brand" : "text-muted"}`}
            >
              <ItemIcon className="size-[22px]" />
              {label}
              {href === "/tasks" && openTasks > 0 && (
                <span className="absolute top-1.5 left-1/2 ml-2 rounded-full bg-brand px-1.5 text-[10px] font-semibold leading-4 text-white">
                  {openTasks}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

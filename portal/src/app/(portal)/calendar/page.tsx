import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { addDays, daysBetween, formatDay, monthGrid, monthOf, shiftMonth, todayInBerlin } from "@/lib/calendar";
import { getLaunchCalendar, getNextMilestone } from "@/lib/data";
import { requireClient } from "@/lib/session";
import type { LaunchTask } from "@/lib/types";
import { CalendarItems, OpenItem } from "./item-dialog";

export const metadata: Metadata = { title: "Launch calendar" };

/** Everything on each day: timed items in time order, then all-day ones, with done ones last. */
function byDay(items: LaunchTask[], days: string[]): Map<string, LaunchTask[]> {
  const map = new Map<string, LaunchTask[]>(days.map((d) => [d, []]));
  const rank = (t: LaunchTask) => `${t.done ? 1 : 0}${t.time ?? "99"}`;
  for (const item of [...items].sort((a, b) => rank(a).localeCompare(rank(b)))) {
    // Something that runs over several days shows on each of them.
    for (let day = item.start; day <= (item.end ?? item.start); day = addDays(day, 1)) map.get(day)?.push(item);
  }
  return map;
}

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const client = await requireClient();
  const today = todayInBerlin();
  const month = monthOf((await props.searchParams).month, today);
  const days = monthGrid(month);
  const [items, next] = await Promise.all([getLaunchCalendar(client.id, days[0], days[days.length - 1]), getNextMilestone(client.id, today)]);
  const entries = byDay(items, days);
  const inMonth = days.filter((d) => d.startsWith(month));
  // The phone agenda lists a multi-day item once: on its first day, or the 1st if it started last month.
  const agenda = new Map(inMonth.map((d) => [d, entries.get(d)!.filter((t) => t.start === d || d === inMonth[0])]));
  const busyDays = inMonth.filter((d) => agenda.get(d)!.length > 0);

  return (
    <CalendarItems>
      <div className="space-y-8">
        <header>
          <h1 className="text-[34px] leading-tight font-bold tracking-[-0.03em] text-ink sm:text-[40px]">Launch calendar</h1>
          <p className="mt-2 text-[15px] text-muted">The key dates for your launch. Tap any of them to see the details.</p>
        </header>

        {next && <NextMilestone task={next} today={today} />}

        <section className="card overflow-hidden">
          {/* Month switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-6">
            <h2 className="text-[19px] font-bold tracking-[-0.02em] text-ink">{formatDay(`${month}-01`, { month: "long", year: "numeric" })}</h2>
            <div className="flex items-center gap-1.5">
              {month !== today.slice(0, 7) && (
                <Link href="/calendar" className="mr-1 rounded-full px-3 py-1.5 text-[13px] font-semibold text-brand hover:bg-brand-soft">
                  Today
                </Link>
              )}
              <MonthLink month={shiftMonth(month, -1)} label="Previous month" icon={Icon.arrowLeft} />
              <MonthLink month={shiftMonth(month, 1)} label="Next month" icon={Icon.arrowRight} />
            </div>
          </div>

          <Legend />

          {/* Month grid on tablets and up */}
          <div className="hidden sm:block">
            <div className="grid grid-cols-7 border-b border-line bg-canvas text-[12px] font-semibold text-muted">
              {days.slice(0, 7).map((d) => (
                <div key={d} className="px-2.5 py-2">
                  {formatDay(d, { weekday: "short" })}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, i) => (
                <DayCell key={day} day={day} items={entries.get(day)!} today={today} outside={!day.startsWith(month)} lastCol={i % 7 === 6} />
              ))}
            </div>
          </div>

          {/* Agenda on phones */}
          <div className="sm:hidden">
            {busyDays.length === 0 ? (
              <p className="px-4 py-10 text-center text-[14px] text-muted">Nothing planned this month.</p>
            ) : (
              <ol className="divide-y divide-line">
                {busyDays.map((day) => (
                  <li key={day} className={`flex gap-4 px-4 py-4 ${day < today ? "opacity-60" : ""}`}>
                    <div className={`w-11 shrink-0 text-center ${day === today ? "text-brand" : "text-ink"}`}>
                      <p className="text-[11px] font-semibold uppercase text-muted">{formatDay(day, { weekday: "short" })}</p>
                      <p className="text-[22px] leading-tight font-bold">{Number(day.slice(8))}</p>
                      {day === today && <p className="text-[10.5px] font-semibold">Today</p>}
                    </div>
                    <ul className="min-w-0 flex-1 space-y-1.5">
                      {agenda.get(day)!.map((item) => (
                        <Pill key={item.id} item={item} roomy />
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {busyDays.length === 0 && <p className="hidden border-t border-line px-6 py-4 text-[13.5px] text-muted sm:block">Nothing planned this month.</p>}
        </section>
      </div>
    </CalendarItems>
  );
}

function MonthLink({ month, label, icon: ArrowIcon }: { month: string; label: string; icon: typeof Icon.arrowLeft }) {
  return (
    <Link
      href={`/calendar?month=${month}`}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-full text-muted ring-1 ring-line transition hover:bg-canvas hover:text-ink"
    >
      <ArrowIcon className="size-4" />
    </Link>
  );
}

/** The page's icon from Notion (emoji or image); otherwise a star for a milestone or a calendar for an event. */
function ItemIcon({ item, className = "size-4 text-[13px]" }: { item: LaunchTask; className?: string }) {
  const icon = item.icon;
  if (icon?.type === "image") {
    // Notion file URLs are signed and short-lived, so skip next/image caching.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon.url} alt="" className={`shrink-0 rounded-[4px] object-cover ${className}`} />;
  }
  if (icon?.type === "emoji") {
    return (
      <span aria-hidden="true" className={`flex shrink-0 items-center justify-center leading-none ${className}`}>
        {icon.value}
      </span>
    );
  }
  if (item.event && !item.milestone) return <Icon.calendar className={`shrink-0 opacity-70 ${className}`} />;
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center leading-none text-brand ${className}`}>
      ★
    </span>
  );
}

function NextMilestone({ task, today }: { task: LaunchTask; today: string }) {
  const days = daysBetween(today, task.start);
  const when = days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  return (
    <OpenItem
      id={task.id}
      title={task.title}
      className="group relative isolate block w-full overflow-hidden rounded-[24px] bg-ink-2 px-6 py-6 text-left text-white [clip-path:inset(0_round_24px)] sm:px-8"
    >
      <div className="pointer-events-none absolute -top-28 -right-20 size-[300px] rounded-full bg-brand/45 blur-[100px]" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] ring-1 ring-white/10">
            <ItemIcon item={task} className="size-8 text-[30px]" />
          </span>
          <div className="min-w-0">
            <p className="mb-1 text-[12px] font-semibold text-white/45">Next milestone</p>
            <p className="text-[22px] leading-snug font-bold tracking-[-0.02em] sm:text-[26px]">{task.title}</p>
            <p className="mt-0.5 text-[14px] text-white/55">
              {formatDay(task.start, { weekday: "long", day: "numeric", month: "long" })}
              {task.time && ` · ${task.time}`}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink transition group-hover:gap-2.5">
          {when} <Icon.arrowRight className="size-3.5" />
        </span>
      </div>
    </OpenItem>
  );
}

function Legend() {
  const items = [
    { label: "Milestone", swatch: "bg-brand-soft ring-1 ring-brand/40" },
    { label: "Event", swatch: "bg-ink-2" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-4 py-3 text-[12.5px] text-muted sm:px-6">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full ${i.swatch}`} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function DayCell({ day, items, today, outside, lastCol }: { day: string; items: LaunchTask[]; today: string; outside: boolean; lastCol: boolean }) {
  const isToday = day === today;
  return (
    <div
      className={`min-h-[118px] border-b border-line p-1.5 ${lastCol ? "" : "border-r"} ${outside ? "bg-canvas/70" : ""} ${day < today ? "[&_li]:opacity-60" : ""}`}
    >
      <p className="mb-1 flex px-1">
        <span
          className={`flex size-6 items-center justify-center rounded-full text-[12.5px] font-semibold ${
            isToday ? "bg-brand text-white" : outside ? "text-faint" : "text-ink"
          }`}
        >
          {Number(day.slice(8))}
        </span>
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <Pill key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}

const PILL = {
  milestone: "bg-brand-soft text-ink ring-1 ring-brand/20 font-semibold hover:ring-brand/50",
  event: "bg-ink-2 text-white font-medium hover:bg-ink",
  done: "text-faint hover:bg-canvas",
} as const;

/** One milestone or event; opens its details. `roomy` (the phone agenda) wraps long titles and shows the time underneath. */
function Pill({ item, roomy = false }: { item: LaunchTask; roomy?: boolean }) {
  const size = roomy ? "px-3 py-2 text-[14px] rounded-xl" : "px-1.5 py-1 text-[11.5px] rounded-md";
  const wrap = roomy ? "break-words" : "truncate";
  const style = item.done ? PILL.done : item.event ? PILL.event : PILL.milestone;
  const shortTime = item.time?.slice(0, 5);
  return (
    <li>
      <OpenItem
        id={item.id}
        title={item.title}
        className={`flex w-full items-center gap-1.5 text-left leading-snug transition ${size} ${style}`}
      >
        {item.done ? (
          <Icon.check className="size-3.5 shrink-0 text-success" strokeWidth={2.2} />
        ) : (
          <ItemIcon item={item} className={roomy ? "size-5 text-[17px]" : "size-3.5 text-[12px]"} />
        )}
        <span className={`min-w-0 flex-1 ${wrap}`} title={[item.title, item.time].filter(Boolean).join(" · ")}>
          {!roomy && shortTime && <span className={`mr-1 font-normal ${item.event && !item.done ? "text-white/60" : "text-muted"}`}>{shortTime}</span>}
          <span className={item.done ? "line-through decoration-faint/60" : ""}>{item.title}</span>
          {roomy && (item.time || item.end) && (
            <span className={`block text-[12.5px] font-normal ${item.event && !item.done ? "text-white/60" : "text-muted"}`}>
              {[item.time, item.end && `until ${formatDay(item.end, { day: "numeric", month: "short" })}`].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
      </OpenItem>
    </li>
  );
}

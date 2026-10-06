import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { addDays, daysBetween, formatDay, monthGrid, monthOf, offsetLabel, shiftMonth, STATUS_LABEL, todayInBerlin } from "@/lib/calendar";
import { getLaunchCalendar, getNextMilestone } from "@/lib/data";
import { requireClient } from "@/lib/session";
import type { ClientEvent, LaunchTask } from "@/lib/types";

export const metadata: Metadata = { title: "Launch calendar" };

type Entry = { kind: "task"; task: LaunchTask } | { kind: "event"; event: ClientEvent; time?: string };

const TIMED_RE = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})[\d:.]*(Z|[+-]\d{2}:\d{2})$/;

/** Everything on each day: events first (they have a time), then milestones, then the rest. */
function byDay(tasks: LaunchTask[], events: ClientEvent[], days: string[]): Map<string, Entry[]> {
  const map = new Map<string, Entry[]>(days.map((d) => [d, []]));
  for (const event of events) {
    const timed = TIMED_RE.exec(event.start);
    map.get(event.start.slice(0, 10))?.push({ kind: "event", event, time: timed ? `${timed[1]} ${offsetLabel(timed[2])}` : undefined });
  }
  const rank = (t: LaunchTask) => (t.milestone ? 0 : t.status === "done" ? 2 : 1);
  for (const task of [...tasks].sort((a, b) => rank(a) - rank(b))) {
    // A task that runs over several days shows on each of them.
    for (let day = task.start; day <= (task.end ?? task.start); day = addDays(day, 1)) map.get(day)?.push({ kind: "task", task });
  }
  return map;
}

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const client = await requireClient();
  const today = todayInBerlin();
  const month = monthOf((await props.searchParams).month, today);
  const days = monthGrid(month);
  const [{ tasks, events }, next] = await Promise.all([
    getLaunchCalendar(client.id, days[0], days[days.length - 1]),
    getNextMilestone(client.id, today),
  ]);
  const entries = byDay(tasks, events, days);
  const inMonth = days.filter((d) => d.startsWith(month));
  // The phone agenda lists a multi-day task once: on its first day, or the 1st if it started last month.
  const agenda = new Map(inMonth.map((d) => [d, entries.get(d)!.filter((e) => e.kind === "event" || e.task.start === d || d === inMonth[0])]));
  const busyDays = inMonth.filter((d) => agenda.get(d)!.length > 0);
  const toReview = tasks.filter((t) => t.status === "review").length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[34px] leading-tight font-bold tracking-[-0.03em] text-ink sm:text-[40px]">Launch calendar</h1>
        <p className="mt-2 text-[15px] text-muted">Everything we&apos;re doing for your launch, day by day, and the key dates we&apos;re working towards.</p>
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

        <Legend reviews={toReview} />

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
              <DayCell key={day} day={day} entries={entries.get(day)!} today={today} outside={!day.startsWith(month)} lastCol={i % 7 === 6} />
            ))}
          </div>
        </div>

        {/* Agenda on phones */}
        <div className="sm:hidden">
          {busyDays.length === 0 ? (
            <p className="px-4 py-10 text-center text-[14px] text-muted">Nothing scheduled this month.</p>
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
                    {agenda.get(day)!.map((entry) => (
                      <EntryPill key={entryKey(entry)} entry={entry} roomy />
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>

        {busyDays.length === 0 && (
          <p className="hidden border-t border-line px-6 py-4 text-[13.5px] text-muted sm:block">Nothing scheduled this month.</p>
        )}
      </section>
    </div>
  );
}

const entryKey = (e: Entry) => (e.kind === "event" ? `e-${e.event.id}` : `t-${e.task.id}`);

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

function NextMilestone({ task, today }: { task: LaunchTask; today: string }) {
  const days = daysBetween(today, task.start);
  const when = days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  return (
    <section className="relative isolate overflow-hidden rounded-[24px] bg-ink-2 px-6 py-6 text-white [clip-path:inset(0_round_24px)] sm:px-8">
      <div className="pointer-events-none absolute -top-28 -right-20 size-[300px] rounded-full bg-brand/45 blur-[100px]" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-[12px] font-semibold text-white/45">Next milestone</p>
          <p className="text-[22px] leading-snug font-bold tracking-[-0.02em] sm:text-[26px]">{task.title}</p>
          <p className="mt-1 text-[14px] text-white/55">{formatDay(task.start, { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <span className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink">{when}</span>
      </div>
    </section>
  );
}

function Legend({ reviews }: { reviews: number }) {
  const items = [
    { label: "Milestone", swatch: "bg-brand" },
    { label: "Our work", swatch: "bg-white ring-1 ring-faint" },
    { label: "Ready for your review", swatch: "bg-warn" },
    { label: "Event or call", swatch: "bg-ink-2" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-4 py-3 text-[12.5px] text-muted sm:px-6">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full ${i.swatch}`} />
          {i.label}
        </span>
      ))}
      {reviews > 0 && (
        <span className="ml-auto rounded-full bg-warn-soft px-2.5 py-0.5 font-semibold text-warn">
          {reviews} waiting on you
        </span>
      )}
    </div>
  );
}

function DayCell({ day, entries, today, outside, lastCol }: { day: string; entries: Entry[]; today: string; outside: boolean; lastCol: boolean }) {
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
        {entries.map((entry) => (
          <EntryPill key={entryKey(entry)} entry={entry} />
        ))}
      </ul>
    </div>
  );
}

const PILL = {
  milestone: "bg-brand text-white font-semibold",
  review: "bg-warn-soft text-warn ring-1 ring-warn/20 font-medium",
  in_progress: "bg-white text-ink ring-1 ring-line",
  planned: "bg-white text-ink ring-1 ring-line",
  done: "text-faint",
  event: "bg-ink-2 text-white font-medium",
} as const;

/** One task or event. `roomy` (the phone agenda) wraps long titles and spells out the status. */
function EntryPill({ entry, roomy = false }: { entry: Entry; roomy?: boolean }) {
  const size = roomy ? "px-3 py-2 text-[14px] rounded-xl" : "px-1.5 py-1 text-[11.5px] rounded-md";
  const wrap = roomy ? "break-words" : "truncate";

  if (entry.kind === "event") {
    const { event, time } = entry;
    return (
      <li title={[event.name, time].filter(Boolean).join(" · ")} className={`flex items-center gap-1.5 leading-snug ${size} ${PILL.event}`}>
        <Icon.calendar className="size-3.5 shrink-0 text-white/60" />
        <span className={`min-w-0 flex-1 ${wrap}`}>
          {!roomy && time && <span className="mr-1 text-white/60">{time.slice(0, 5)}</span>}
          {event.name}
          {roomy && time && <span className="block text-[12.5px] font-normal text-white/60">{time}</span>}
        </span>
      </li>
    );
  }

  const { task } = entry;
  const style = task.status === "done" ? PILL.done : task.milestone ? PILL.milestone : PILL[task.status];
  const status = STATUS_LABEL[task.status];
  return (
    <li title={`${task.title} · ${status}`} className={`flex items-center gap-1.5 leading-snug ${size} ${style}`}>
      {task.status === "done" ? (
        <Icon.check className="size-3.5 shrink-0 text-success" strokeWidth={2.2} />
      ) : task.milestone ? (
        <span aria-hidden="true" className="shrink-0 text-[11px]">★</span>
      ) : task.status === "in_progress" ? (
        <span className="relative size-2.5 shrink-0 rounded-full border-[1.4px] border-brand">
          <span className="absolute inset-[1.5px] rounded-full bg-brand [clip-path:inset(0_50%_0_0)]" />
        </span>
      ) : (
        <span className={`size-2.5 shrink-0 rounded-full ${task.status === "review" ? "bg-warn" : "border-[1.4px] border-faint"}`} />
      )}
      <span className={`min-w-0 flex-1 ${wrap}`}>
        <span className={task.status === "done" ? "line-through decoration-faint/60" : ""}>{task.title}</span>
        {roomy && (
          <span className={`block text-[12.5px] font-normal ${task.milestone && task.status !== "done" ? "text-white/70" : "text-muted"}`}>
            {task.milestone && task.status !== "done" ? "Milestone · " : ""}
            {status}
            {task.end && ` · until ${formatDay(task.end, { day: "numeric", month: "short" })}`}
          </span>
        )}
      </span>
    </li>
  );
}

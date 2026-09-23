import Link from "next/link";
import { AddEvent } from "@/components/add-event";
import { EventRow } from "@/components/event-row";
import { Icon, ProgressBar, SectionHeading, StatusDot } from "@/components/ui";
import { EVENT_NAME_MAX, getClientEvents, getClientTasks, getUpcomingWork } from "@/lib/data";
import { requireClient } from "@/lib/session";

export default async function HomePage() {
  const client = await requireClient();
  const [tasks, events, work] = await Promise.all([
    getClientTasks(client.id),
    getClientEvents(client.id),
    getUpcomingWork(client.id),
  ]);

  const done = tasks.filter((t) => t.status === "Complete").length;
  const open = tasks.filter((t) => t.status !== "Complete");
  const next = open.find((t) => t.status === "In Progress") ?? open[0];
  const shown = open.slice(0, 5);
  const upcoming = events.slice(0, 4);
  const links = [
    { label: "Asset upload folder", hint: "Drop your images, videos and files here", url: client.assetFolderUrl, emoji: "📤" },
    { label: "Google Drive folder", hint: "Everything we create for you", url: client.driveFolderUrl, emoji: "📁" },
  ].filter((l): l is typeof l & { url: string } => Boolean(l.url));

  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[13px] font-semibold tracking-[0.02em] text-muted">
            {client.name} <span className="text-faint">×</span> FunnelHaus
          </p>
          <h1 className="text-[34px] leading-tight font-bold tracking-[-0.03em] text-ink sm:text-[40px]">
            Welcome back, {client.contactFirstName}
          </h1>
        </div>
      </header>

      {/* Progress */}
      {open.length > 0 && (
        <section className="relative isolate overflow-hidden rounded-[24px] bg-ink-2 p-7 text-white [clip-path:inset(0_round_24px)] sm:p-9">
          <div className="pointer-events-none absolute -top-32 -right-24 size-[380px] rounded-full bg-brand/45 blur-[110px]" />
          <div className="relative grid grid-cols-1 gap-8 lg:grid-cols-[1fr_minmax(0,380px)] lg:items-center">
            <div>
              <p className="mb-3 text-[12px] font-semibold text-white/45">Onboarding progress</p>
              <p className="text-[40px] leading-none font-bold tracking-[-0.03em]">
                {done} <span className="text-white/35">of {tasks.length}</span>
              </p>
              <p className="mt-2 mb-6 text-[15px] text-white/55">tasks complete — the sooner these are done, the sooner we launch.</p>
              <ProgressBar value={done / tasks.length} className="max-w-md" />
            </div>

            {next && (
              <Link
                href={`/tasks/${next.id}`}
                className="group block rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/10 transition hover:bg-white/[0.11]"
              >
                <p className="mb-2 text-[12px] font-semibold text-white/45">Next action</p>
                <p className="flex items-center gap-2.5 text-[17px] font-semibold leading-snug">
                  {next.icon && <span>{next.icon}</span>}
                  {next.name}
                </p>
                <div className="mt-4 flex justify-end">
                  <span className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink transition group-hover:gap-2.5">
                    Start <Icon.arrowRight className="size-3.5" />
                  </span>
                </div>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Tasks + focus */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="card p-6 lg:col-span-3">
          <SectionHeading
            title={open.length ? `${open.length} ${open.length === 1 ? "task needs" : "tasks need"} your attention` : "Your tasks"}
            action={
              <Link href="/tasks" className="text-[13px] font-semibold text-brand hover:underline">
                All tasks
              </Link>
            }
          />
          {open.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl bg-success-soft px-4 py-4 text-[14px] text-success">
              <Icon.check className="size-5" strokeWidth={2} />
              {tasks.length ? "You're all caught up. Nice work." : "No tasks yet — we'll add them here."}
            </div>
          ) : (
            <ul className="-mx-2">
              {shown.map((task) => (
                <li key={task.id}>
                  <Link href={`/tasks/${task.id}`} className="group flex items-center gap-4 rounded-xl px-2 py-3 transition hover:bg-canvas">
                    <StatusDot status={task.status} />
                    <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">
                      {task.icon && <span className="mr-2">{task.icon}</span>}
                      {task.name}
                    </p>
                    <Icon.chevronRight className="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-muted" />
                  </Link>
                </li>
              ))}
              {open.length > shown.length && (
                <li>
                  <Link href="/tasks" className="block rounded-xl px-2 pt-3 text-[13.5px] font-medium text-muted hover:text-ink">
                    + {open.length - shown.length} more
                  </Link>
                </li>
              )}
            </ul>
          )}
        </section>

        <section className="card p-6 lg:col-span-2">
          <SectionHeading title="Resources" />
          {links.length === 0 ? (
            <p className="text-[14px] text-muted">Your folder links will appear here once they&apos;re set up.</p>
          ) : (
            <ul className="space-y-2.5">
              {links.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener"
                    className="group flex items-center gap-3.5 rounded-2xl bg-canvas p-4 ring-1 ring-line transition hover:bg-white hover:ring-brand/25"
                  >
                    <span className="text-xl">{l.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-ink">{l.label}</span>
                      <span className="block truncate text-[12.5px] text-muted">{l.hint}</span>
                    </span>
                    <Icon.external className="size-4 shrink-0 text-faint transition group-hover:text-brand" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* This week + coming up */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="card p-6 lg:col-span-3">
          <SectionHeading title="What we're working on this week" />
          {work.length === 0 ? (
            <p className="text-[14px] text-muted">Nothing scheduled for the next 7 days.</p>
          ) : (
            <ul className="space-y-3">
              {work.map((w) => (
                <li key={w.id} className="flex items-start gap-3 text-[15px] text-ink">
                  <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-brand" />
                  {w.title}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6 lg:col-span-2">
          <SectionHeading title="Coming up" />
          {upcoming.length === 0 ? (
            <p className="text-[14px] text-muted">No upcoming dates yet.</p>
          ) : (
            <ol className="space-y-5">
              {upcoming.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </ol>
          )}
          <AddEvent maxName={EVENT_NAME_MAX} />
        </section>
      </div>

    </div>
  );
}

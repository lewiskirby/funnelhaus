import type { Metadata } from "next";
import Link from "next/link";
import { StatusToggle } from "@/components/task-status";
import { Icon } from "@/components/ui";
import { getClientTasks } from "@/lib/data";
import { requireClient } from "@/lib/session";
import type { Task } from "@/lib/types";

export const metadata: Metadata = { title: "Tasks" };

function TaskRow({ task }: { task: Task }) {
  const done = task.status === "Complete";
  return (
    <li className="group flex items-center gap-4 px-5 transition hover:bg-canvas sm:px-6">
      <StatusToggle taskId={task.id} status={task.status} name={task.name} />
      <Link href={`/tasks/${task.id}`} className="flex min-w-0 flex-1 items-center gap-4 py-4">
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[15px] font-medium ${done ? "text-muted line-through decoration-faint/60" : "text-ink"}`}>
            {task.icon && <span className="mr-2 no-underline">{task.icon}</span>}
            {task.name}
          </p>
          {(task.status === "In Progress" || task.clientResponse) && (
            <div className="mt-1 flex flex-wrap gap-x-3 text-[12.5px]">
              {task.status === "In Progress" && <span className="font-medium text-warn">In progress</span>}
              {task.clientResponse && <span className="text-muted">Response added</span>}
            </div>
          )}
        </div>
        <Icon.chevronRight className="size-4 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-muted" />
      </Link>
    </li>
  );
}

// "Priority Group 1" → "Priority 1"; tasks without one go last under "Other".
function priorityGroups(tasks: Task[]) {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.priority ?? "";
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, undefined, { numeric: true })))
    .map(([key, items]) => ({ label: key ? key.replace(/^Priority Group/i, "Priority") : "Other", items }));
}

export default async function TasksPage() {
  const client = await requireClient();
  const tasks = await getClientTasks(client.id);
  const todo = tasks.filter((t) => t.status !== "Complete");
  const done = tasks.filter((t) => t.status === "Complete");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-[34px] leading-tight font-bold tracking-[-0.03em] text-ink sm:text-[40px]">Your tasks</h1>
          <p className="mt-2 text-[15px] text-muted">Everything we need from you, in one list. Tick things off as you go.</p>
        </div>
        {tasks.length > 0 && (
          <div className="flex items-center gap-4 rounded-2xl bg-white px-5 py-3.5 ring-1 ring-line">
            <svg viewBox="0 0 36 36" className="size-11 -rotate-90" aria-hidden="true">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-line)" strokeWidth="3.5" />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="var(--color-brand)"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={`${(done.length / tasks.length) * 97.4} 97.4`}
              />
            </svg>
            <div>
              <p className="text-[12px] text-muted">Progress</p>
              <p className="text-[15px] font-semibold text-ink">
                {done.length} of {tasks.length} complete
              </p>
            </div>
          </div>
        )}
      </header>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-muted">
          To do <span className="rounded-full bg-white px-2 py-0.5 text-[11px] ring-1 ring-line">{todo.length}</span>
        </h2>
        {todo.length === 0 ? (
          <div className="card flex items-center gap-3 p-6 text-[15px] text-success">
            <span className="flex size-9 items-center justify-center rounded-full bg-success-soft">
              <Icon.check className="size-5" strokeWidth={2} />
            </span>
            {tasks.length ? "All done here. We'll add new tasks as the project moves forward." : "No tasks yet — we'll add them here."}
          </div>
        ) : (
          <div className="space-y-6">
            {priorityGroups(todo).map((group) => (
              <div key={group.label}>
                <h3 className="mb-2 px-1 text-[13px] font-medium text-ink">{group.label}</h3>
                <ul className="card divide-y divide-line overflow-hidden">
                  {group.items.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-muted">
            Completed <span className="rounded-full bg-white px-2 py-0.5 text-[11px] ring-1 ring-line">{done.length}</span>
          </h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

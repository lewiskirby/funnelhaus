import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotionContent } from "@/components/notion-content";
import { TaskHeader } from "@/components/task-status";
import { Icon } from "@/components/ui";
import { RESPONSE_MAX, getClientTask, getClientTaskContent } from "@/lib/data";
import { requireClient } from "@/lib/session";
import { ResponseForm } from "./response-form";

export async function generateMetadata({ params }: PageProps<"/tasks/[id]">): Promise<Metadata> {
  const client = await requireClient();
  const task = await getClientTask(client.id, (await params).id);
  return { title: task?.name ?? "Task" };
}

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const client = await requireClient();
  const { id } = await params;
  const [task, content] = await Promise.all([getClientTask(client.id, id), getClientTaskContent(client.id, id)]);
  // Tasks that don't exist and tasks belonging to another client look identical.
  if (!task) notFound();

  return (
    <div className="mx-auto max-w-[760px]">
      <Link href="/tasks" className="mb-8 inline-flex items-center gap-2 text-[14px] font-medium text-muted transition hover:text-ink">
        <Icon.arrowLeft className="size-4" /> All tasks
      </Link>

      <article className="card overflow-hidden">
        <TaskHeader taskId={task.id} status={task.status} name={task.name} icon={task.icon} />

        {content.length > 0 && (
          <div className="p-7 sm:p-10">
            <NotionContent blocks={content} />
          </div>
        )}

        <div className="border-t border-line bg-canvas/60 p-7 sm:p-10">
          <ResponseForm key={task.clientResponse ?? ""} taskId={task.id} initial={task.clientResponse} max={RESPONSE_MAX} />
        </div>
      </article>
    </div>
  );
}

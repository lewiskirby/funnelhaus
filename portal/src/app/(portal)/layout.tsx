import Link from "next/link";
import { ClientSwitcher } from "@/components/client-switcher";
import { BottomNav, SidebarNav } from "@/components/nav";
import { ClientAvatar, Icon, LogoMark } from "@/components/ui";
import { getClientTasks, listClientsForAdmin } from "@/lib/data";
import { getSession, requireClient } from "@/lib/session";
import { logout } from "../login/actions";

export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const client = await requireClient();
  const isAdmin = Boolean((await getSession())?.isAdmin);
  const [tasks, clients] = await Promise.all([getClientTasks(client.id), isAdmin ? listClientsForAdmin() : Promise.resolve([])]);
  const openTasks = tasks.filter((t) => t.status !== "Complete").length;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-canvas px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-3">
          <LogoMark className="h-6 w-auto" />
          <span className="text-[15px] font-bold tracking-tight text-ink">FunnelHaus</span>
        </div>

        <div className="mb-6">
          {isAdmin ? (
            <ClientSwitcher current={client} clients={clients} />
          ) : (
            <Link href="/" className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line transition hover:ring-faint">
              <ClientAvatar client={client} />
              <p className="min-w-0 truncate text-sm font-semibold text-ink">{client.name}</p>
            </Link>
          )}
        </div>

        <SidebarNav openTasks={openTasks} />

        <div className="mt-auto space-y-1 border-t border-line pt-4">
          <form action={logout}>
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-muted transition hover:bg-white/60 hover:text-ink">
              <Icon.logout className="size-[18px] text-faint" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/85 px-5 py-3.5 backdrop-blur-xl lg:hidden">
        {isAdmin ? (
          <ClientSwitcher current={client} clients={clients} compact />
        ) : (
          <div className="flex items-center gap-2">
            <LogoMark className="h-5 w-auto" />
            <span className="text-[15px] font-bold tracking-tight text-ink">FunnelHaus</span>
          </div>
        )}
        <form action={logout}>
          <button aria-label="Sign out" className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-white">
            <Icon.logout className="size-[18px]" />
          </button>
        </form>
      </header>

      <main className="min-w-0 px-5 pt-8 pb-28 sm:px-8 lg:px-12 lg:pt-12 lg:pb-16">
        <div className="mx-auto max-w-[1080px]">{children}</div>
      </main>

      <BottomNav openTasks={openTasks} />
    </div>
  );
}

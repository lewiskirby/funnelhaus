import type { Metadata } from "next";
import { TEAM_NAME_MAX, getTeam } from "@/lib/data";
import { getSession, requireClient } from "@/lib/session";
import { AddTeammate, RemoveTeammate, SignedIn } from "./team-controls";

export const metadata: Metadata = { title: "Team" };

const initials = (name: string, email: string) =>
  (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export default async function TeamPage() {
  const client = await requireClient();
  const session = await getSession();
  const team = await getTeam(client.id);
  const me = session?.user?.id;

  return (
    <div className="mx-auto max-w-[760px] space-y-8">
      <header>
        <h1 className="text-[34px] leading-tight font-bold tracking-[-0.03em] text-ink sm:text-[40px]">Team</h1>
        <p className="mt-2 text-[15px] text-muted">
          Everyone here can sign in to {client.name}&apos;s portal with their own email. No passwords: we email them a code each time.
        </p>
      </header>

      <section className="card overflow-hidden">
        {team.length === 0 ? (
          <p className="p-6 text-[14px] text-muted">Nobody can sign in yet. Add someone below.</p>
        ) : (
          <ul className="divide-y divide-line">
            {team.map((person) => (
              <li key={person.id} className="flex items-center gap-4 px-5 py-4 sm:px-6">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-canvas text-[13px] font-semibold text-muted ring-1 ring-line">
                  {initials(person.name, person.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">
                    {person.name || person.email}
                    {person.id === me && <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-[11.5px] font-medium text-muted ring-1 ring-line">You</span>}
                  </p>
                  <p className="truncate text-[13px] text-muted">
                    {person.email} · <SignedIn at={person.lastSignedIn} />
                  </p>
                </div>
                {person.id !== me && <RemoveTeammate userId={person.id} name={person.name || person.email} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-6">
        <h2 className="text-[17px] font-semibold text-ink">Add a teammate</h2>
        <p className="mt-1 mb-5 text-[14px] text-muted">We&apos;ll email them to say they&apos;ve been added and how to sign in.</p>
        <AddTeammate maxName={TEAM_NAME_MAX} />
      </section>
    </div>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <p className="mb-4 text-5xl">🧭</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-[15px] text-muted">It may have moved, or it isn&apos;t part of your portal.</p>
        <Link href="/" className="mt-6 inline-flex rounded-full bg-brand px-5 py-3 text-[14px] font-semibold text-white hover:bg-brand-dark">
          Back to your portal
        </Link>
      </div>
    </main>
  );
}

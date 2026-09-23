"use client";

export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <p className="mb-4 text-4xl">🔌</p>
      <h1 className="text-xl font-bold tracking-tight text-ink">We couldn&apos;t load your portal</h1>
      <p className="mt-2 text-[15px] text-muted">Something went wrong on our side. Please try again in a moment.</p>
      <button onClick={reset} className="mt-6 rounded-full bg-brand px-5 py-3 text-[14px] font-semibold text-white hover:bg-brand-dark">
        Try again
      </button>
    </div>
  );
}

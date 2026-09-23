// Shown instantly while the task loads from Notion.
export default function LoadingTask() {
  return (
    <div className="mx-auto max-w-[760px] animate-pulse" aria-busy="true" aria-label="Loading task">
      <div className="mb-8 h-4 w-20 rounded bg-line" />
      <div className="card overflow-hidden">
        <div className="space-y-4 border-b border-line p-7 sm:p-10">
          <div className="size-10 rounded-xl bg-line" />
          <div className="h-8 w-2/3 rounded-lg bg-line" />
          <div className="h-6 w-24 rounded-full bg-line" />
        </div>
        <div className="space-y-3 p-7 sm:p-10">
          <div className="aspect-video w-full rounded-2xl bg-line" />
          <div className="h-4 w-full rounded bg-line" />
          <div className="h-4 w-5/6 rounded bg-line" />
          <div className="h-4 w-4/6 rounded bg-line" />
        </div>
      </div>
    </div>
  );
}

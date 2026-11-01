export default function MainLoading() {
  return (
    <div className="page-shell" aria-busy="true" aria-label="Loading page">
      <div className="page-heading">
        <div className="grid gap-3">
          <div className="h-8 w-56 animate-pulse rounded bg-[var(--color-paper-2)]" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded bg-[var(--color-paper-2)]" />
        </div>
        <div className="hidden gap-2 sm:flex">
          <div className="h-10 w-32 animate-pulse rounded-full bg-[var(--color-paper-2)]" />
          <div className="h-10 w-40 animate-pulse rounded-full bg-[var(--color-paper-2)]" />
        </div>
      </div>
      <div className="grid gap-6">
        <div className="h-28 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-paper-2)]" />
        <div className="h-64 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-paper-2)]" />
      </div>
    </div>
  );
}

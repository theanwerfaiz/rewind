/** Shown while a page's data loads: the page's shape, not a spinner. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-6 space-y-3">
        <div className="h-4 w-40 rounded bg-raised" />
        <div className="h-7 w-80 max-w-full rounded bg-raised" />
        <div className="h-4 w-96 max-w-full rounded bg-panel" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-[72px] rounded-xl border border-line bg-panel" />
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0"
          >
            <div className="h-8 w-8 rounded-md bg-raised" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/2 rounded bg-raised" />
              <div className="h-3 w-1/3 rounded bg-hover" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

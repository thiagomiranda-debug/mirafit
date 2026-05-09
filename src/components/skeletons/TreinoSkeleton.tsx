// src/components/skeletons/TreinoSkeleton.tsx
export default function TreinoSkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="skeleton h-9 w-9 rounded-xl" />
            <div className="space-y-1.5">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-3 w-20" />
            </div>
          </div>
          <div className="skeleton h-8 w-20 rounded-xl" />
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-3 px-4 py-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 w-full rounded-2xl" />
        ))}
      </main>
    </div>
  );
}

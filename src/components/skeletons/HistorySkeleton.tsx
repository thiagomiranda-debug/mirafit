// src/components/skeletons/HistorySkeleton.tsx
export default function HistorySkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      <header className="px-5 pb-5 pt-6">
        <div className="skeleton h-7 w-32" />
      </header>
      <div className="px-4 pb-4">
        <div className="skeleton h-10 w-full rounded-xl" />
      </div>
      <main className="flex flex-1 flex-col gap-3 px-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-24 w-full rounded-2xl" />
        ))}
      </main>
    </div>
  );
}

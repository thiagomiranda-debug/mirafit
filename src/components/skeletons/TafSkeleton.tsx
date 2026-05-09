// src/components/skeletons/TafSkeleton.tsx
export default function TafSkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      <header className="px-5 pb-5 pt-6">
        <div className="skeleton h-7 w-24" />
      </header>
      <main className="flex flex-1 flex-col gap-4 px-4">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28 w-full rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-12 w-full rounded-2xl" />
        <div className="skeleton h-40 w-full rounded-2xl" />
      </main>
    </div>
  );
}

// src/components/skeletons/HomeSkeleton.tsx
export default function HomeSkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      <header className="px-5 pb-5 pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-7 w-32" />
          </div>
          <div className="skeleton h-9 w-9 rounded-full" />
        </div>
        <div className="mt-3 flex gap-2">
          <div className="skeleton h-5 w-16 rounded-full" />
          <div className="skeleton h-5 w-12 rounded-full" />
          <div className="skeleton h-5 w-20 rounded-full" />
        </div>
      </header>
      <div className="px-4 pb-3">
        <div className="skeleton h-11 w-full rounded-xl" />
      </div>
      <main className="flex flex-1 flex-col gap-4 px-4">
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-24 w-full rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-16 w-full rounded-2xl" />
        <div className="skeleton h-14 w-full rounded-2xl" />
        <div className="skeleton h-14 w-full rounded-2xl" />
        <div className="space-y-2.5">
          <div className="skeleton h-4 w-24" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-16 w-full rounded-2xl" />
          ))}
        </div>
      </main>
    </div>
  );
}

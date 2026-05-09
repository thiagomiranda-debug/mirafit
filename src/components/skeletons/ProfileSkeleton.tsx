// src/components/skeletons/ProfileSkeleton.tsx
export default function ProfileSkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      <header className="px-5 pb-5 pt-6">
        <div className="flex items-center gap-4">
          <div className="skeleton h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <div className="skeleton h-5 w-32" />
            <div className="skeleton h-3 w-20" />
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 px-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-11 w-full rounded-xl" />
          </div>
        ))}
      </main>
    </div>
  );
}

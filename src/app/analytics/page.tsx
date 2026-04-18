"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AnalyticsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/history");
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--background)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
    </div>
  );
}

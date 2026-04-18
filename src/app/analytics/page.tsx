"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import MuscleAnalytics from "@/components/MuscleAnalytics";
import BottomNav from "@/components/BottomNav";

export default function AnalyticsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--background)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      <MuscleAnalytics userId={user.uid} />
      <BottomNav />
    </div>
  );
}

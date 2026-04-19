"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProfile } from "@/lib/userProfile";
import BottomNav from "@/components/BottomNav";
import TafDashboard from "@/components/TafDashboard";
import { TafGender, TafAgeGroup } from "@/lib/tafData";

export default function TafPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [pageLoading, setPageLoading] = useState(true);
  const [gender, setGender] = useState<TafGender | undefined>();
  const [ageGroup, setAgeGroup] = useState<TafAgeGroup | undefined>();

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const profile = await getUserProfile(user.uid);
      if (cancelled) return;
      if (!profile) {
        router.push("/onboarding");
        return;
      }
      setGender(profile.gender ?? undefined);
      setAgeGroup(profile.age_group ?? undefined);
      setPageLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (authLoading || pageLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--background)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--red-500)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-[var(--background)] pb-20">
      <header className="px-5 pb-1 pt-6">
        <h1
          className="text-3xl text-[var(--foreground)]"
          style={{ fontFamily: "var(--font-bebas)" }}
        >
          MODO TAF
        </h1>
        <p className="text-xs text-[var(--text-dim)]">
          Avaliação física conforme edital CBMAL
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-5 px-4 py-5">
        <TafDashboard
          userId={user!.uid}
          gender={gender}
          ageGroup={ageGroup}
        />
      </main>

      <BottomNav />
    </div>
  );
}

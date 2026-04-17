import { auth } from "@/lib/domain/auth";
import { redirect } from "next/navigation";
import { TierSidebar } from "@/components/nav/tier-sidebar";
import { BottomNav } from "@/components/nav/bottom-nav";
import { UserTopBar } from "@/components/nav/user-top-bar";
import { OfflineBanner } from "@/components/offline-banner";
import { StarField } from "@/components/animation/star-field";
import { WonderField } from "@/components/animation/wonder-field";
import { CommandPalette } from "@/components/pro/command-palette";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen">
      <OfflineBanner />
      {/* Three.js star field — only renders for cosmic tier (P4-6) */}
      <StarField />
      {/* Lightweight ambient drift — only renders for wonder tier (P1-3) */}
      <WonderField />
      {/* Sidebar: tier-gated — hidden for wonder/cosmic, shown on md+ for flow/studio */}
      <TierSidebar />
      {/* Main content: full-width on mobile, padded bottom for bottom nav */}
      <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
        {children}
      </main>
      {/* Bottom nav: shown on mobile, hidden on md+ */}
      <BottomNav />
      {/* Floating avatar/menu — all roles. Sidebar-less tiers + mobile need this. */}
      <UserTopBar />
      {/* Cmd+K global search — available on all dashboard pages */}
      <CommandPalette />
    </div>
  );
}

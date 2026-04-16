import { auth } from "@/lib/domain/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/nav/sidebar";
import { BottomNav } from "@/components/nav/bottom-nav";
import { OfflineBanner } from "@/components/offline-banner";
import { StarField } from "@/components/animation/star-field";

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
      {/* Sidebar: hidden on mobile, shown on md+ */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      {/* Main content: full-width on mobile, padded bottom for bottom nav */}
      <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
        {children}
      </main>
      {/* Bottom nav: shown on mobile, hidden on md+ */}
      <BottomNav />
    </div>
  );
}

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { getSession } from "@/lib/auth/session";
import { SIDEBAR_COOKIE } from "@/lib/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { DemoBanner } from "@/components/layout/demo-banner";

export default async function PainelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login");

  const cookieStore = await cookies();
  const initialCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "true";

  return (
    <div className="flex h-svh w-full overflow-hidden">
      <div className="hidden md:flex">
        <Sidebar
          user={session.user}
          demoMode={session.demoMode}
          initialCollapsed={initialCollapsed}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={session.user} demoMode={session.demoMode} />
        {session.demoMode && <DemoBanner />}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

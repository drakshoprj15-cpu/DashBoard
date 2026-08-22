import type { Metadata } from "next";
import { Suspense } from "react";

import {
  DashboardRouteSkeleton,
  DashboardView,
} from "@/features/dashboard/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardRouteSkeleton />}>
      <DashboardView />
    </Suspense>
  );
}

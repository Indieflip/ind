import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function AnomaliesLayout({ children }: { children: React.ReactNode }) {
  await requireUser(can.viewAnomalies);
  return (
    <>
      {children}
    </>
  );
}

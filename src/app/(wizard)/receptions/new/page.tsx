import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Wizard } from "@/components/reception/Wizard";

export const dynamic = "force-dynamic";

export default async function NewReceptionPage() {
  const user = await requireUser(can.receive);
  return (
    <Suspense>
      <Wizard blReadingEnabled={!!process.env.ANTHROPIC_API_KEY} receiver={{ name: user.role === "invite" ? "" : user.name.trim(), mustType: user.role === "invite" || !user.name.trim() }} />
    </Suspense>
  );
}

import { redirect } from "next/navigation";
import { hasAnyUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { AuthCard } from "@/components/AuthCard";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await hasAnyUser()) redirect("/login");
  const { t } = await getDict();
  return (
    <AuthCard title={t.auth.setupTitle} subtitle={t.auth.setupIntro}>
      <SetupForm />
    </AuthCard>
  );
}

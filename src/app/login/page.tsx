import { redirect } from "next/navigation";
import { getUser, hasAnyUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { AuthCard } from "@/components/AuthCard";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await hasAnyUser())) redirect("/setup");
  if (await getUser()) redirect("/accueil");
  const { t } = await getDict();
  return (
    <AuthCard title={t.app.name} subtitle={t.auth.login}>
      <LoginForm />
    </AuthCard>
  );
}

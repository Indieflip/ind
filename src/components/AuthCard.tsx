import { LocaleSwitch } from "./LocaleSwitch";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src="/icon.svg" alt="" className="h-14 w-14" />
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-stone-600">{subtitle}</p>}
        </div>
        <div className="card p-5">{children}</div>
        <div className="mt-4 flex justify-center">
          <LocaleSwitch />
        </div>
      </div>
    </main>
  );
}

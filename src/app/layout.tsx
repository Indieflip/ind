import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { ServiceWorker } from "@/components/ServiceWorker";
import { ConfirmHost } from "@/components/Confirm";

export const metadata: Metadata = {
  title: "Réception marchandises",
  description: "Contrôle des livraisons, traçabilité HACCP et suivi des prix",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Réception", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#187257",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-dvh antialiased">
        <I18nProvider locale={locale}>
          {children}
          <ConfirmHost />
        </I18nProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}

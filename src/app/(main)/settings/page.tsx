import { GoogleSheetsSettings } from "@/components/GoogleSheetsSettings";
import { CurrencySettings } from "@/components/CurrencySettings";

export const metadata = { title: "Settings — Extracto" };

export default function SettingsPage() {
  return (
    <main className="page-shell max-w-5xl">
      <header className="page-heading">
        <div><h1>Settings</h1><p>Manage your preferences and connected export destination.</p></div>
      </header>
      <div className="grid gap-6">
        <CurrencySettings />
        <GoogleSheetsSettings />
      </div>
    </main>
  );
}

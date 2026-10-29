import { GoogleSheetsSettings } from "@/components/GoogleSheetsSettings";
import { CurrencySettings } from "@/components/CurrencySettings";
import { SavedExports } from "@/components/SavedExports";
import { WorkspaceSettings } from "@/components/WorkspaceSettings";
import { BillingSettings } from "@/components/BillingSettings";

export const metadata = { title: "Settings — Extracto" };
export default function SettingsPage() {
  return (
    <main className="page-shell">
      <div className="page-column">
        <header className="page-heading">
          <div><h1>Settings</h1><p>Manage your workspace, its reviewers, your plan and usage, and connected export destinations.</p></div>
        </header>
        <div className="grid gap-6">
          <WorkspaceSettings />
          <BillingSettings />
          <CurrencySettings />
          <GoogleSheetsSettings />
          <SavedExports />
        </div>
      </div>
    </main>
  );
}

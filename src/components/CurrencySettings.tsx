"use client";

import { useEffect, useState } from "react";

interface SettingsResponse {
  baseCurrency: string;
  locale: string;
  availableCurrencies: string[];
}

export function CurrencySettings() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Could not load settings"))))
      .then(setSettings)
      .catch((e) => {
        setFailed(true);
        setMessage(e instanceof Error ? e.message : "Could not load settings");
      });
  }, []);

  async function changeBaseCurrency(baseCurrency: string) {
    if (!settings) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseCurrency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setSettings({ ...settings, baseCurrency: data.baseCurrency });
      setMessage("Base currency saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  if (failed) return (
    <section className="surface grid gap-4 p-5" aria-labelledby="currency-heading">
      <div><h2 id="currency-heading">Currency</h2><p className="mt-1 text-sm text-error">{message}</p></div>
    </section>
  );

  if (!settings) return (
    <section className="surface grid gap-4 p-5" aria-busy="true" aria-label="Loading currency settings">
      <div><h2>Currency</h2><p className="mt-1 text-sm text-muted">Loading…</p></div>
    </section>
  );

  return (
    <section className="surface grid gap-4 p-5" aria-labelledby="currency-heading">
      <div>
        <h2 id="currency-heading">Currency</h2>
        <p className="mt-1 text-sm text-muted">
          Choose the base currency used to convert reviewed totals across all documents.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid w-40 gap-1 text-sm">
          <span className="text-muted">Base currency</span>
          <select
            className="field-control field-control-select"
            value={settings.baseCurrency}
            disabled={busy}
            onChange={(e) => void changeBaseCurrency(e.target.value)}
          >
            {settings.availableCurrencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        {message && <p role="status" className="text-sm text-ink-2">{message}</p>}
      </div>
      <p className="text-xs text-muted">Extraction still records each document in its own currency. This setting only affects aggregate converted totals.</p>
    </section>
  );
}
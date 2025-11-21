// src/app/onboarding/page.tsx
"use client";

import { useState, useEffect } from "react";

type StripeAccountInput = {
  label: string;
  name: string;
};

const STRIPE_ACCOUNTS: StripeAccountInput[] = [
  { label: "Account 1", name: "account1" },
  { label: "Account 2", name: "account2" },
  { label: "Account 3", name: "account3" },
  { label: "Account 4", name: "account4" },
];

export default function OnboardingPage() {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [existingConfig, setExistingConfig] = useState<any>(null);

  // ✅ CARICA CONFIG ESISTENTE
  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = await res.json();
          setExistingConfig(data);
          console.log("[onboarding] Config caricata:", data);
        }
      } catch (err) {
        console.error("[onboarding] Errore caricamento config:", err);
      } finally {
        setLoadingConfig(false);
      }
    }
    loadConfig();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    setError(null);

    const formData = new FormData(e.currentTarget);

    const payload = {
      shopify: {
        shopDomain: (formData.get("shopifyDomain") as string) || "",
        adminToken: (formData.get("shopifyAdminToken") as string) || "",
        storefrontToken:
          (formData.get("shopifyStorefrontToken") as string) || "",
        apiVersion: "2024-10",
      },

      stripeAccounts: STRIPE_ACCOUNTS.map((acc, index) => ({
        label:
          ((formData.get(`${acc.name}-label`) as string) ||
            acc.label) ?? `Account ${index + 1}`,
        secretKey: ((formData.get(`${acc.name}-secret`) as string) || "").trim(),
        publishableKey: ((formData.get(`${acc.name}-publishable`) as string) || "").trim(),
        webhookSecret:
          ((formData.get(`${acc.name}-webhook`) as string) || "").trim(),
        active: formData.get(`${acc.name}-active`) === "on",
        order: index,
        merchantSite:
          ((formData.get(`${acc.name}-merchantSite`) as string) || "").trim(),
        lastUsedAt: existingConfig?.stripeAccounts?.[index]?.lastUsedAt || 0,
        // ✅ Serializza i 10 product title aggiuntivi
        ...Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => [
            `productTitle${i + 1}`,
            (
              formData.get(`${acc.name}-productTitle${i + 1}`) as string
            )?.trim() || "",
          ])
        ),
      })),

      defaultCurrency: (
        (formData.get("defaultCurrency") as string) ||
        "eur"
      ).toLowerCase(),
      checkoutDomain:
        (typeof window !== "undefined" ? window.location.origin : "") || "",
    };

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Errore salvataggio configurazione");
      }

      setSaved(true);

      // Ricarica config dopo il salvataggio
      const reloadRes = await fetch("/api/config");
      if (reloadRes.ok) {
        const reloadData = await reloadRes.json();
        setExistingConfig(reloadData);
      }
    } catch (err: any) {
      setError(err.message ?? "Errore imprevisto");
    } finally {
      setLoading(false);
    }
  }

  if (loadingConfig) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-slate-400">Caricamento configurazione...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4 py-10">
      <div className="max-w-6xl w-full space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-slate-300 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {existingConfig ? "Modifica configurazione" : "Setup iniziale"} • Checkout Hub
            </div>
            <h1 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight text-slate-50">
              Collega Shopify, Stripe e Firebase
            </h1>
            <p className="mt-2 text-sm text-slate-400 max-w-xl">
              {existingConfig 
                ? "Modifica la configurazione esistente. I campi sono già compilati con i valori attuali."
                : "Configura una sola volta, poi il tuo checkout custom gestirà in automatico carrelli, pagamenti multi-account Stripe e sincronizzazione ordini."
              }
            </p>
          </div>

          <div className="glass-card px-4 py-3 flex flex-col gap-1 md:w-72">
            <p className="text-xs font-medium text-slate-300">
              Stato onboarding
            </p>
            <p className="text-sm text-slate-400">
              {existingConfig 
                ? "✓ Configurazione esistente caricata. Modifica i campi che desideri aggiornare."
                : "Completa i campi essenziali e salva la configurazione. I dati vengono memorizzati in Firebase e riutilizzati dal backend."
              }
            </p>
          </div>
        </header>

        {/* Layout principale */}
        <form
          onSubmit={handleSubmit}
          className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start"
        >
          {/* Colonna sinistra: Shopify + Stripe */}
          <div className="space-y-6">
            {/* Shopify card */}
            {/* ...(come prima, invariato)... */}

            {/* Stripe accounts card */}
            <section className="glass-card p-6 md:p-7 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="glass-label">Gateway di pagamento</p>
                  <h2 className="text-lg font-semibold text-slate-50 flex items-center gap-2">
                    Stripe multi-account
                  </h2>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <p>Fino a 4 account Stripe</p>
                  <p>Rotazione automatica ogni 6 ore</p>
                </div>
              </div>

              <div className="grid gap-4">
                {STRIPE_ACCOUNTS.map((acc, index) => {
                  const existingAccount = existingConfig?.stripeAccounts?.[index];

                  return (
                    <div
                      key={acc.name}
                      className="rounded-2xl border border-white/10 bg-white/3 p-4 space-y-3"
                    >
                      {/* ...Altri campi come prima... */}
                      <div className="grid gap-3">
                        {/* ...altri input come prima... */}
                        <div>
                          <label className="glass-label">
                            Merchant site (per metadata / descriptor)
                          </label>
                          <input
                            name={`${acc.name}-merchantSite`}
                            className="glass-input"
                            placeholder="es. https://notforresale.it"
                            defaultValue={existingAccount?.merchantSite || ""}
                          />
                        </div>
                        {/* 10 campi PRODUCT TITLE */}
                        <div>
                          <label className="glass-label">
                            Product titles dinamici (max 10)
                            <span className="text-xs text-slate-400 ml-2">(Usato random su ogni transazione)</span>
                          </label>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            {Array.from({ length: 10 }).map((_, i) => (
                              <input
                                key={i}
                                name={`${acc.name}-productTitle${i + 1}`}
                                className="glass-input"
                                placeholder={`Product title #${i + 1}`}
                                defaultValue={existingAccount?.[`productTitle${i + 1}`] || ""}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
          {/* ...parte Firebase e pulsanti come prima... */}
          {/* Colonna destra invariata */}
        </form>
      </div>
    </main>
  );
}


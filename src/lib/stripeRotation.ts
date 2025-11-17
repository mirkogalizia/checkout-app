// src/lib/stripeRotation.ts
import { db } from "@/lib/firebaseAdmin"
import { getConfig, StripeAccount } from "@/lib/config"

const SIX_HOURS = 6 * 60 * 60 * 1000

export async function getActiveStripeAccount(): Promise<StripeAccount> {
  const config = await getConfig()
  
  const activeAccounts = config.stripeAccounts.filter(
    (a) => a.active && a.secretKey && a.publishableKey
  )

  if (activeAccounts.length === 0) {
    throw new Error("Nessun account Stripe attivo configurato")
  }

  // Ordina per lastUsedAt (più vecchio first)
  activeAccounts.sort((a, b) => (a.lastUsedAt || 0) - (b.lastUsedAt || 0))

  const now = Date.now()
  let selectedAccount = activeAccounts[0]

  // Se l'ultimo uso è più vecchio di 6 ore, usa quello
  const timeSinceLastUse = now - (selectedAccount.lastUsedAt || 0)

  if (timeSinceLastUse < SIX_HOURS && activeAccounts.length > 1) {
    // Cerca il primo account non usato di recente
    for (const account of activeAccounts) {
      const accountTimeSinceUse = now - (account.lastUsedAt || 0)
      if (accountTimeSinceUse >= SIX_HOURS) {
        selectedAccount = account
        break
      }
    }
  }

  // Aggiorna lastUsedAt per l'account selezionato
  const updatedAccounts = config.stripeAccounts.map((a) =>
    a.label === selectedAccount.label ? { ...a, lastUsedAt: now } : a
  )

  await db.collection("config").doc("global").update({
    stripeAccounts: updatedAccounts,
  })

  console.log(`[stripeRotation] ✓ Account attivo: ${selectedAccount.label}`)

  return selectedAccount
}

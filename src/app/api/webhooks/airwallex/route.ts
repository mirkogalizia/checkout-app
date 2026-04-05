// src/app/api/webhooks/airwallex/route.ts

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"
import { verifyAirwallexWebhook } from "@/lib/gateway/airwallex"
import {
  createShopifyOrder,
  sendMetaPurchaseEvent,
  clearShopifyCart,
} from "@/app/api/webhooks/stripe/route"

const COLLECTION = "cartSessions"

export async function POST(req: NextRequest) {
  try {
    console.log("[airwallex-webhook] ════════════════════════════════════")
    console.log("[airwallex-webhook] 🔔 Webhook ricevuto:", new Date().toISOString())

    const config = await getConfig()

    if (!config.airwallex?.webhookSecret) {
      console.error("[airwallex-webhook] ❌ Webhook secret non configurato")
      return NextResponse.json({ error: "Config mancante" }, { status: 500 })
    }

    const body = await req.text()
    const signature = req.headers.get("x-signature") || ""
    const timestamp = req.headers.get("x-timestamp") || ""

    // Debug headers
    console.log("[airwallex-webhook] 🔍 Headers:", {
      "x-signature": signature ? signature.substring(0, 20) + "..." : "(vuoto)",
      "x-timestamp": timestamp || "(vuoto)",
      "content-type": req.headers.get("content-type"),
    })
    console.log("[airwallex-webhook] 🔑 Secret configurato:", !!config.airwallex.webhookSecret)

    // Verifica signature
    const { isValid, format } = verifyAirwallexWebhook(
      body,
      signature,
      timestamp,
      config.airwallex.webhookSecret,
    )

    if (!isValid) {
      console.error("[airwallex-webhook] ❌ Signature non valida — nessun formato ha corrisposto")
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    console.log(`[airwallex-webhook] ✅ Signature valida (formato: ${format})`)

    const event = JSON.parse(body)
    console.log(`[airwallex-webhook] 📨 Evento: ${event.name}`)

    // Airwallex manda "payment_intent.succeeded" o "payment_attempt.authorized"
    if (
      event.name === "payment_intent.succeeded" ||
      event.name === "payment_attempt.authorized"
    ) {
      const piData = event.data?.object || event.data || {}
      const intentId = piData.id
      const amountRaw = piData.amount || 0
      const amountCents = Math.round(amountRaw * 100)
      const currency = (piData.currency || "EUR").toUpperCase()
      const sessionId = piData.metadata?.session_id

      console.log(`[airwallex-webhook] 💳 Intent ID: ${intentId}`)
      console.log(`[airwallex-webhook] 💰 Importo: €${amountRaw}`)

      if (!sessionId) {
        console.error("[airwallex-webhook] ❌ NESSUN session_id!")
        return NextResponse.json({ received: true, warning: "no_session_id" }, { status: 200 })
      }

      const snap = await db.collection(COLLECTION).doc(sessionId).get()

      if (!snap.exists) {
        console.error(`[airwallex-webhook] ❌ Sessione ${sessionId} NON TROVATA`)
        return NextResponse.json({ received: true, error: "session_not_found" }, { status: 200 })
      }

      const sessionData: any = snap.data() || {}

      // ── LOCK TRANSAZIONALE ────────────────────────────────────────────
      const sessionRef = db.collection(COLLECTION).doc(sessionId)
      let alreadyLocked = false

      await db.runTransaction(async (tx) => {
        const doc = await tx.get(sessionRef)
        const d = doc.data() || {}
        if (d.shopifyOrderId || d.webhookProcessing || d.shopifyOrderFailed) {
          alreadyLocked = true
          return
        }
        tx.update(sessionRef, {
          webhookProcessing: true,
          webhookProcessingAt: new Date().toISOString(),
        })
      })

      if (alreadyLocked) {
        console.log(`[airwallex-webhook] ℹ️ Già processato per sessione ${sessionId}`)
        return NextResponse.json({ received: true, alreadyProcessed: true }, { status: 200 })
      }

      console.log("[airwallex-webhook] 🚀 CREAZIONE ORDINE SHOPIFY...")

      // Crea un oggetto compatibile con il formato che createShopifyOrder si aspetta
      const fakePaymentIntent = {
        id: intentId,
        amount: amountCents,
        currency: currency.toLowerCase(),
        payment_method: "airwallex",
        customer: null,
        metadata: {
          session_id: sessionId,
        },
      }

      const result = await createShopifyOrder({
        sessionId,
        sessionData,
        paymentIntent: fakePaymentIntent,
        config,
        stripeAccountLabel: "Airwallex",
      })

      // ── AGGIORNA FIREBASE ─────────────────────────────────────────────
      const firebaseUpdate: Record<string, any> = {
        webhookProcessing: false,
        paymentStatus: "paid",
        webhookProcessedAt: new Date().toISOString(),
        gatewayType: "airwallex",
        airwallexIntentId: intentId,
      }

      if (result.orderId) {
        console.log(`[airwallex-webhook] 🎉 Ordine creato: #${result.orderNumber}`)
        firebaseUpdate.shopifyOrderId = result.orderId
        firebaseUpdate.shopifyOrderNumber = result.orderNumber
        firebaseUpdate.orderCreatedAt = new Date().toISOString()
      } else {
        console.error("[airwallex-webhook] ❌ Creazione ordine Shopify FALLITA")
        firebaseUpdate.shopifyOrderError = "creation_failed"
        firebaseUpdate.shopifyOrderFailed = true
      }

      await db.collection(COLLECTION).doc(sessionId).update(firebaseUpdate)

      // ── STATISTICHE GIORNALIERE ───────────────────────────────────────
      const today = new Date().toISOString().split("T")[0]
      const statsRef = db.collection("dailyStats").doc(today)

      await db.runTransaction(async (transaction) => {
        const statsDoc = await transaction.get(statsRef)
        if (!statsDoc.exists) {
          transaction.set(statsRef, {
            date: today,
            accounts: {
              Airwallex: { totalCents: amountCents, transactionCount: 1 },
            },
            totalCents: amountCents,
            totalTransactions: 1,
          })
        } else {
          const data = statsDoc.data()!
          const accountStats = data.accounts?.Airwallex || { totalCents: 0, transactionCount: 0 }
          transaction.update(statsRef, {
            ["accounts.Airwallex.totalCents"]: accountStats.totalCents + amountCents,
            ["accounts.Airwallex.transactionCount"]: accountStats.transactionCount + 1,
            totalCents: (data.totalCents || 0) + amountCents,
            totalTransactions: (data.totalTransactions || 0) + 1,
          })
        }
      })

      // ── META CONVERSIONS API ──────────────────────────────────────────
      await sendMetaPurchaseEvent({
        paymentIntent: fakePaymentIntent,
        sessionData,
        sessionId,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        req,
      })

      // ── SVUOTA CARRELLO ───────────────────────────────────────────────
      if (sessionData.rawCart?.id) {
        await clearShopifyCart(sessionData.rawCart.id, config)
      }

      console.log("[airwallex-webhook] ════════════════════════════════════")
      console.log("[airwallex-webhook] ✅ COMPLETATO CON SUCCESSO")

      return NextResponse.json({
        received: true,
        orderId: result.orderId ?? null,
        orderNumber: result.orderNumber ?? null,
      }, { status: 200 })
    }

    console.log(`[airwallex-webhook] ℹ️ Evento ${event.name} ignorato`)
    return NextResponse.json({ received: true }, { status: 200 })

  } catch (error: any) {
    console.error("[airwallex-webhook] 💥 ERRORE CRITICO:", error.message)
    return NextResponse.json({ error: error?.message }, { status: 500 })
  }
}

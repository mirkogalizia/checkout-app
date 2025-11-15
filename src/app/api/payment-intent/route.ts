// src/app/api/payment-intent/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

const COLLECTION = "cartSessions"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const sessionId = body.sessionId as string | undefined

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId mancante" },
        { status: 400 },
      )
    }

    // 1) Recupero dati carrello da Firestore
    const snap = await db.collection(COLLECTION).doc(sessionId).get()

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Nessun carrello trovato per questa sessione" },
        { status: 404 },
      )
    }

    const data = snap.data() || {}

    const currency = (data.currency || "EUR").toString().toLowerCase()

    const subtotalCents =
      typeof data.subtotalCents === "number"
        ? data.subtotalCents
        : (data.totals?.subtotal ?? 0)

    const shippingCents =
      typeof data.shippingCents === "number" ? data.shippingCents : 0

    const totalCents =
      typeof data.totalCents === "number"
        ? data.totalCents
        : subtotalCents + shippingCents

    if (!totalCents || totalCents < 50) {
      return NextResponse.json(
        { error: "Importo non valido." },
        { status: 400 },
      )
    }

    // 2) Prendo la secret key Stripe da Firebase (onboarding)
    const cfg = await getConfig()
    const firstStripe =
      (cfg.stripeAccounts || []).find((a: any) => a.secretKey) || null

    const secretKey =
      firstStripe?.secretKey || process.env.STRIPE_SECRET_KEY || ""

    if (!secretKey) {
      console.error("[payment-intent] Nessuna Stripe secret key configurata")
      return NextResponse.json(
        { error: "Configurazione Stripe mancante" },
        { status: 500 },
      )
    }

    const stripe = new Stripe(secretKey)

    // 3) Creo PaymentIntent **SOLO CARTA**
    //    (niente Bancontact, EPS, ecc → payment_method_types: ["card"])
    const pi = await stripe.paymentIntents.create({
      amount: totalCents,
      currency,
      payment_method_types: ["card"],
    })

    // 4) Salvo l'id del PaymentIntent sulla sessione checkout
    await db
      .collection(COLLECTION)
      .doc(sessionId)
      .set(
        {
          paymentIntentId: pi.id,
        },
        { merge: true },
      )

    return NextResponse.json(
      { clientSecret: pi.client_secret },
      { status: 200 },
    )
  } catch (err: any) {
    console.error("[payment-intent] errore:", err)
    return NextResponse.json(
      { error: err.message || "Errore interno" },
      { status: 500 },
    )
  }
}
// src/app/api/payment-intent/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/firebaseAdmin";

type Customer = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  zip: string;
  country: string;
};

type CheckoutSessionDoc = {
  sessionId: string;
  currency?: string;
  subtotalCents?: number;
  shippingCents?: number;
  totalCents?: number;
  paymentIntentId?: string;
  paymentIntentClientSecret?: string;
  [key: string]: any;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = body.sessionId as string | undefined;
    const customer = body.customer as Customer | undefined;
    const shippingCentsFromClient = Number(body.shippingCents || 0);

    // nuovi fallback dal client
    const bodySubtotalCents = Number(body.subtotalCents || 0);
    const bodyTotalCents = Number(body.totalCents || 0);

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId mancante nella richiesta." },
        { status: 400 },
      );
    }

    // 1) Config da Firebase
    const cfg = await getConfig();

    // scegli il primo account Stripe con secretKey valorizzata
    const activeAccount =
      cfg.stripeAccounts.find((a: any) => a.secretKey) ?? cfg.stripeAccounts[0];

    if (!activeAccount?.secretKey) {
      return NextResponse.json(
        { error: "Nessun account Stripe configurato." },
        { status: 500 },
      );
    }

    // merchant_site opzionale, se lo hai aggiunto in config
    const merchantSite: string | undefined =
      (activeAccount as any).merchantSite || undefined;

    const stripe = new Stripe(activeAccount.secretKey, {
      apiVersion: "2025-10-29.clover" as any,
    });

    // 2) Recupera sessione carrello da Firestore (se esiste)
    const ref = db.collection("checkoutSessions").doc(sessionId);
    const snap = await ref.get();

    const session: CheckoutSessionDoc | {} = snap.exists
      ? ((snap.data() || {}) as CheckoutSessionDoc)
      : {};

    const subtotalCents = Number(
      (session as CheckoutSessionDoc).subtotalCents ?? bodySubtotalCents ?? 0,
    );

    const sessionShippingCents = Number(
      (session as CheckoutSessionDoc).shippingCents ?? 0,
    );

    // shipping usata nel totale:
    const shippingCents =
      shippingCentsFromClient > 0
        ? shippingCentsFromClient
        : sessionShippingCents;

    const sessionTotal = Number(
      (session as CheckoutSessionDoc).totalCents ?? 0,
    );

    const totalCents =
      (sessionTotal && sessionTotal > 0
        ? sessionTotal
        : 0) ||
      (bodyTotalCents && bodyTotalCents > 0
        ? bodyTotalCents
        : subtotalCents + shippingCents);

    if (!totalCents || totalCents <= 0) {
      return NextResponse.json(
        { error: "Importo totale non valido per il payment intent." },
        { status: 400 },
      );
    }

    const currency =
      ((session as CheckoutSessionDoc).currency ||
        cfg.defaultCurrency ||
        "eur"
      ).toLowerCase();

    // 3) Costruisci shipping per Stripe
    let shipping: Stripe.PaymentIntentCreateParams.Shipping | undefined;

    if (customer) {
      const fullName = `${customer.firstName || ""} ${
        customer.lastName || ""
      }`.trim();

      const hasAddressCore =
        fullName ||
        customer.address1 ||
        customer.city ||
        customer.zip ||
        customer.country;

      if (hasAddressCore) {
        shipping = {
          name: fullName || customer.firstName || customer.lastName || "Cliente",
          phone: customer.phone || undefined,
          address: {
            line1: customer.address1 || "",
            line2: customer.address2 || undefined,
            postal_code: customer.zip || "",
            city: customer.city || "",
            state: customer.province || "",
            country: customer.country || "IT",
          },
        };
      }
    }

    // 4) Se esiste già un paymentIntent nella sessione, prova a riutilizzarlo
    const existingPiId = (session as CheckoutSessionDoc).paymentIntentId;

    if (existingPiId) {
      try {
        const existing = await stripe.paymentIntents.retrieve(existingPiId);

        if (
          existing &&
          existing.status !== "canceled" &&
          existing.currency === currency &&
          existing.amount === totalCents
        ) {
          return NextResponse.json(
            {
              clientSecret: existing.client_secret,
              paymentIntentId: existing.id,
            },
            { status: 200 },
          );
        }

        // se amount o currency non coincidono, lo aggiorniamo
        if (
          existing &&
          existing.status !== "canceled" &&
          (existing.amount !== totalCents || existing.currency !== currency)
        ) {
          const updated = await stripe.paymentIntents.update(existing.id, {
            amount: totalCents,
            currency,
            ...(shipping ? { shipping } : {}),
            metadata: {
              sessionId,
              ...(merchantSite ? { merchant_site: merchantSite } : {}),
            },
          });

          await ref.set(
            {
              paymentIntentId: updated.id,
              paymentIntentClientSecret: updated.client_secret,
              totalCents,
            },
            { merge: true },
          );

          return NextResponse.json(
            {
              clientSecret: updated.client_secret,
              paymentIntentId: updated.id,
            },
            { status: 200 },
          );
        }
      } catch (e) {
        console.warn(
          "[payment-intent] impossibile riutilizzare paymentIntent esistente, ne creo uno nuovo.",
          e,
        );
      }
    }

    // 5) Crea un nuovo PaymentIntent
    const createParams: Stripe.PaymentIntentCreateParams = {
      amount: totalCents,
      currency,
      payment_method_types: ["card"],
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        sessionId,
        ...(merchantSite ? { merchant_site: merchantSite } : {}),
      },
      ...(shipping ? { shipping } : {}),
    };

    const pi = await stripe.paymentIntents.create(createParams);

    // 6) Salva (o crea) il documento sessione
    await ref.set(
      {
        sessionId,
        totalCents,
        paymentIntentId: pi.id,
        paymentIntentClientSecret: pi.client_secret,
      },
      { merge: true },
    );

    return NextResponse.json(
      {
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error("[/api/payment-intent] errore:", err);
    return NextResponse.json(
      {
        error:
          err?.message || "Errore interno nella creazione del payment intent.",
      },
      { status: 500 },
    );
  }
}
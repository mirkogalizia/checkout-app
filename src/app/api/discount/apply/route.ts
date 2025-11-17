// src/app/api/discount/apply/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getConfig } from "@/lib/config"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const code = (body?.code as string | undefined)?.trim()
    const sessionId = body?.sessionId as string | undefined

    if (!code) {
      return NextResponse.json(
        { ok: false, error: "Codice sconto mancante." },
        { status: 400 },
      )
    }

    // 1) Config da Firestore (onboarding)
    const cfg = await getConfig()
    const shopDomain = cfg.shopify?.shopDomain
    const adminToken = cfg.shopify?.adminToken
    const apiVersion = cfg.shopify?.apiVersion || "2024-10"

    if (!shopDomain || !adminToken) {
      console.error(
        "[/api/discount/apply] Shopify non configurato correttamente in Firestore.",
        { shopDomain, hasAdminToken: !!adminToken },
      )
      return NextResponse.json(
        {
          ok: false,
          error:
            "Configurazione Shopify mancante lato server. Completa l'onboarding.",
        },
        { status: 500 },
      )
    }

    // 2) Lookup del codice sconto via REST Admin API
    const lookupUrl = `https://${shopDomain}/admin/api/${apiVersion}/discount_codes/lookup.json?code=${encodeURIComponent(
      code,
    )}`

    const lookupRes = await fetch(lookupUrl, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": adminToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    })

    if (lookupRes.status === 404) {
      // codice non esistente / non attivo
      return NextResponse.json(
        { ok: false, error: "Codice sconto non valido o non attivo." },
        { status: 404 },
      )
    }

    if (!lookupRes.ok) {
      const txt = await lookupRes.text()
      console.error(
        "[/api/discount/apply] Errore lookup codice:",
        lookupRes.status,
        txt,
      )

      if (lookupRes.status === 401 || lookupRes.status === 403) {
        // qui è quasi sicuramente un problema di scope: mancano read_discounts / read_price_rules
        return NextResponse.json(
          {
            ok: false,
            error:
              "Token Admin Shopify non ha i permessi per leggere i codici sconto (servono scope read_discounts / read_price_rules).",
          },
          { status: 500 },
        )
      }

      return NextResponse.json(
        {
          ok: false,
          error: "Errore nel contatto con Shopify (lookup codice).",
        },
        { status: 500 },
      )
    }

    const lookupJson = await lookupRes.json()
    const discountCode = lookupJson?.discount_code

    if (!discountCode?.price_rule_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Codice sconto non associato a nessuna regola attiva.",
        },
        { status: 400 },
      )
    }

    const priceRuleId = discountCode.price_rule_id

    // 3) Recupero della price rule per capire tipo e valore
    const prUrl = `https://${shopDomain}/admin/api/${apiVersion}/price_rules/${priceRuleId}.json`

    const prRes = await fetch(prUrl, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": adminToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    })

    if (!prRes.ok) {
      const txt = await prRes.text()
      console.error(
        "[/api/discount/apply] Errore price_rule:",
        prRes.status,
        txt,
      )

      if (prRes.status === 401 || prRes.status === 403) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Token Admin Shopify non ha i permessi per leggere le regole di sconto (price rules).",
          },
          { status: 500 },
        )
      }

      return NextResponse.json(
        {
          ok: false,
          error: "Errore nel recupero della regola di sconto da Shopify.",
        },
        { status: 500 },
      )
    }

    const prJson = await prRes.json()
    const priceRule = prJson?.price_rule

    if (!priceRule) {
      return NextResponse.json(
        {
          ok: false,
          error: "Regola di sconto non trovata o non più valida.",
        },
        { status: 400 },
      )
    }

    const valueType = priceRule.value_type as
      | "percentage"
      | "fixed_amount"
      | "shipping"
    const rawValue = Number(priceRule.value) // es. "-10.0" → 10%
    const absValue = Math.abs(rawValue)

    // per ora supportiamo SOLO percentuale
    if (valueType !== "percentage") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Questo codice sconto non è di tipo percentuale. Al momento il checkout supporta solo sconti in percentuale.",
        },
        { status: 400 },
      )
    }

    // 4) Risposta al frontend
    return NextResponse.json(
      {
        ok: true,
        code: discountCode.code,
        valueType, // "percentage"
        percentValue: absValue, // es. 10
        priceRuleId,
      },
      { status: 200 },
    )
  } catch (err: any) {
    console.error("[/api/discount/apply] Errore generale:", err)
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message || "Errore interno durante la lettura del codice sconto.",
      },
      { status: 500 },
    )
  }
}
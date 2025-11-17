// src/app/api/discount/apply/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getConfig } from "@/lib/config"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const code = body?.code as string | undefined

    if (!code || !code.trim()) {
      return NextResponse.json(
        { ok: false, error: "Codice mancante." },
        { status: 400 },
      )
    }

    const normalizedCode = code.trim()

    // 1) Leggiamo la config da Firestore
    const cfg = await getConfig()
    const shopDomain = cfg.shopify?.shopDomain
    const adminToken = cfg.shopify?.adminToken
    const apiVersion = cfg.shopify?.apiVersion || "2024-10"

    if (!shopDomain || !adminToken) {
      console.error("[/api/discount/apply] Config Shopify mancante:", {
        shopDomain,
        hasAdminToken: !!adminToken,
      })
      return NextResponse.json(
        {
          ok: false,
          error: "Configurazione Shopify mancante (shopDomain / adminToken).",
        },
        { status: 500 },
      )
    }

    // 2) Usiamo l'Admin GraphQL API per cercare il codice sconto
    const graphqlUrl = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`

    const query = `
      query DiscountCodeLookup($code: String!) {
        discountCodeNodes(first: 1, query: $code) {
          edges {
            node {
              id
              code
              usageCount
              createdAt
              discountCode {
                __typename
                ... on DiscountCodeBasic {
                  id
                  title
                  status
                  usageLimit
                  appliesOncePerCustomer
                  customerSelection {
                    __typename
                  }
                  customerGets {
                    __typename
                    value {
                      __typename
                      ... on DiscountAmount {
                        amount {
                          amount
                          currencyCode
                        }
                      }
                      ... on DiscountPercentage {
                        percentage
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `

    const variables = {
      code: normalizedCode,
    }

    const gqlRes = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": adminToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
    })

    if (!gqlRes.ok) {
      const txt = await gqlRes.text()
      console.error(
        "[/api/discount/apply] GraphQL HTTP error:",
        gqlRes.status,
        txt,
      )
      return NextResponse.json(
        { ok: false, error: "Errore nel contatto con Shopify (GraphQL)." },
        { status: 500 },
      )
    }

    const gqlJson = await gqlRes.json()

    if (gqlJson.errors) {
      console.error("[/api/discount/apply] GraphQL errors:", gqlJson.errors)
      return NextResponse.json(
        {
          ok: false,
          error: "Errore nella lettura del codice sconto da Shopify.",
        },
        { status: 500 },
      )
    }

    const edges = gqlJson?.data?.discountCodeNodes?.edges || []
    if (!edges.length) {
      return NextResponse.json(
        { ok: false, error: "Codice sconto non valido o non trovato." },
        { status: 404 },
      )
    }

    const node = edges[0].node
    const gqlCode = node?.code as string | undefined
    const discountCodeObj = node?.discountCode

    if (!gqlCode || !discountCodeObj) {
      return NextResponse.json(
        { ok: false, error: "Codice sconto non valido o non attivo." },
        { status: 400 },
      )
    }

    // Supportiamo solo DiscountCodeBasic per ora
    if (discountCodeObj.__typename !== "DiscountCodeBasic") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Questo codice sconto usa un tipo avanzato non ancora supportato dal checkout.",
        },
        { status: 400 },
      )
    }

    const customerGets = discountCodeObj.customerGets
    const value = customerGets?.value
    if (!value) {
      return NextResponse.json(
        {
          ok: false,
          error: "Valore di sconto non trovato per questo codice.",
        },
        { status: 400 },
      )
    }

    // Può essere percentuale o importo fisso
    let valueType: "percentage" | "fixed_amount" = "percentage"
    let percentValue: number | null = null
    let fixedAmount: number | null = null

    if (value.__typename === "DiscountPercentage") {
      valueType = "percentage"
      percentValue = Number(value.percentage)
    } else if (value.__typename === "DiscountAmount") {
      valueType = "fixed_amount"
      const amountObj = value.amount
      fixedAmount = Number(amountObj?.amount || 0)
    } else {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Questo codice sconto ha un tipo di valore non supportato (solo % o importo fisso).",
        },
        { status: 400 },
      )
    }

    // Per iniziare, supportiamo principalmente gli sconti percentuali
    if (valueType !== "percentage" || percentValue == null) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Questo codice sconto non è di tipo percentuale. Al momento sono supportati solo sconti in percentuale.",
        },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        ok: true,
        code: gqlCode,
        valueType, // "percentage"
        percentValue, // es. 10
      },
      { status: 200 },
    )
  } catch (err: any) {
    console.error("[/api/discount/apply] Errore:", err)
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message || "Errore interno durante l'applicazione del codice.",
      },
      { status: 500 },
    )
  }
}
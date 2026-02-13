// src/app/api/analytics/purchase/route.ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin")
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  })
}

// ✅ GET - Verifica se analytics già esistono
export async function GET(req: NextRequest) {
  try {
    const origin = req.headers.get("origin")
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get("sessionId")

    if (!sessionId) {
      return NextResponse.json(
        { exists: false, error: "sessionId mancante" },
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        }
      )
    }

    const snapshot = await db
      .collection("purchaseEvents")
      .where("sessionId", "==", sessionId)
      .limit(1)
      .get()

    return NextResponse.json(
      {
        exists: !snapshot.empty,
        count: snapshot.size,
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(origin),
        },
      }
    )
  } catch (error: any) {
    console.error("[Analytics Purchase GET] ❌ Errore:", error.message)
    return NextResponse.json(
      { exists: false, error: error.message },
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(null),
        },
      }
    )
  }
}

// ✅ POST - Salva analytics (con check anti-duplicazione)
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin")
    const data = await req.json()
    
    console.log('[Analytics API] 💾 Salvataggio purchase event...')

    const sessionId = data.sessionId

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId è obbligatorio" },
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        }
      )
    }

    // ✅ CHECK ANTI-DUPLICAZIONE
    const existingSnapshot = await db
      .collection("purchaseEvents")
      .where("sessionId", "==", sessionId)
      .limit(1)
      .get()

    if (!existingSnapshot.empty) {
      console.log(`[Analytics API] ⚠️ Analytics già salvate per session ${sessionId}`)
      return NextResponse.json(
        {
          success: false,
          message: "Analytics già salvate",
          id: existingSnapshot.docs[0].id,
        },
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        }
      )
    }
    
    // ✅ Genera ID univoco e salva
    const docRef = db.collection('purchaseEvents').doc()
    
    await docRef.set({
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    console.log('[Analytics API] ✅ Purchase event salvato - ID:', docRef.id)
    console.log('[Analytics API] 📊 Session:', sessionId)
    console.log('[Analytics API] 💰 Value: €', data.value?.toFixed(2) || '0.00')
    console.log('[Analytics API] 🎯 Campaign:', data.utm?.campaign || 'direct')

    return NextResponse.json(
      { 
        success: true, 
        id: docRef.id,
        message: "Analytics salvate con successo"
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(origin),
        },
      }
    )
  } catch (err) {
    console.error('[Analytics API] ❌ Errore:', err)
    return NextResponse.json(
      { 
        error: 'Errore salvataggio analytics',
        details: err instanceof Error ? err.message : 'Unknown error'
      },
      { 
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(null),
        },
      }
    )
  }
}

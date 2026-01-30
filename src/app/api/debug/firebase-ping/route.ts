export const runtime = "nodejs"
import { NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"

export async function GET() {
  try {
    // prova di lettura “innocua” (non richiede collection esistente)
    const projectId = process.env.FIREBASE_PROJECT_ID || null

    // facoltativo: ping reale su Firestore (scrive un doc e lo legge)
    const ref = db.collection("_debug").doc("ping")
    await ref.set({ ts: new Date().toISOString() }, { merge: true })
    const snap = await ref.get()

    return NextResponse.json({
      ok: true,
      projectId,
      hasCreds: !!process.env.FIREBASE_PROJECT_ID && !!process.env.FIREBASE_CLIENT_EMAIL && !!process.env.FIREBASE_PRIVATE_KEY,
      firestoreOk: snap.exists,
      now: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
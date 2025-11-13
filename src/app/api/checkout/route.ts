import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  // Step 7: riceverà payload e genererà snapshot
  return Response.json({ ok: true, message: "checkout init placeholder" });
}
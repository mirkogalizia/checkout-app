// src/app/checkout/page.tsx
import { Suspense } from "react"
import CheckoutClient from "./CheckoutClient"

type CheckoutPageProps = {
  searchParams: {
    [key: string]: string | string[] | undefined
  }
}

export default function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const raw = searchParams.sessionId
  const sessionId =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
      ? raw[0]
      : ""

  return (
    <Suspense>
      <CheckoutClient initialSessionId={sessionId} />
    </Suspense>
  )
}
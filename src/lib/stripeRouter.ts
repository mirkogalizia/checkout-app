let i = -1;
export function pickStripeKey(): string {
  const raw = process.env.STRIPE_SECRET_KEYS || "";
  const keys = raw.split(",").map(k => k.trim()).filter(Boolean);
  if (!keys.length) throw new Error("No STRIPE_SECRET_KEYS provided");
  i = (i + 1) % keys.length;
  return keys[i];
}
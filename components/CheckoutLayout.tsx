export default function CheckoutLayout({
  children, summary,
}: { children: React.ReactNode; summary: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center gap-3">
          <div className="h-6 w-6 rounded bg-black" />
          <span className="text-lg font-semibold">Brand Checkout</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        <section className="md:col-span-2 space-y-6">{children}</section>
        <aside className="md:col-span-1">
          <div className="card p-6 sticky top-6">{summary}</div>
        </aside>
      </main>
    </div>
  );
}
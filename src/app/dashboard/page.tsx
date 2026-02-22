"use client"

import { useEffect, useState, useCallback } from "react"

// ─── TIPI ────────────────────────────────────────────────────────────────────

type Purchase = {
  orderId?: string
  orderNumber?: string
  sessionId?: string
  value: number
  timestamp: string
  normalizedSource?: string
  customer?: { email?: string; fullName?: string; city?: string }
  utm?: {
    source?: string
    medium?: string
    campaign?: string
    content?: string
    term?: string
    campaign_id?: string
    adset_id?: string
    adset_name?: string
    ad_id?: string
    ad_name?: string
    fbclid?: string
    gclid?: string
    ttclid?: string
    first_source?: string
    first_campaign?: string
    first_medium?: string
  }
  items?: Array<{ title: string; quantity: number; priceCents?: number; linePriceCents?: number }>
}

type CampaignDetail = {
  campaign: string
  source: string
  medium: string
  campaignId?: string
  totalRevenue: number
  totalOrders: number
  cpa: number
  orders: Array<{
    orderNumber?: string
    value: number
    timestamp: string
    adSet?: string
    adName?: string
    fbclid?: string
    gclid?: string
    customer?: string
  }>
}

type DashboardData = {
  totalPurchases: number
  totalRevenue: number
  avgOrderValue: number
  uniqueCustomers: number
  byCampaignDetail: CampaignDetail[]
  bySource: Array<{ source: string; purchases: number; revenue: number }>
  byProduct: Array<{ title: string; quantity: number; revenue: number; orders: number }>
  recentPurchases: Purchase[]
  dailyRevenue: Array<{ date: string; revenue: number }>
  hourlyRevenue: Array<{ hour: number; revenue: number }>
  comparison?: {
    purchases: number
    revenue: number
    avgOrderValue: number
    purchasesPercent: number
    revenuePercent: number
  } | null
  meta: { deduplicatedCount: number; duplicatesRemoved: number }
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

const formatMoney = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v)

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

const getDayLabel = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })
}

const sourceEmoji: Record<string, string> = {
  Meta: "📘", Google: "🔍", TikTok: "🎵", Direct: "👤", Referral: "🔗", Organic: "🌱"
}

const sourceColor: Record<string, string> = {
  Meta: "#1877F2", Google: "#EA4335", TikTok: "#000000", Direct: "#6B7280", Referral: "#8B5CF6"
}

// ─── GENERATORE CONSIGLI AI ──────────────────────────────────────────────────

function generateInsights(data: DashboardData): Array<{ type: "success"|"warning"|"danger"|"info"; title: string; message: string; action?: string }> {
  const insights = []
  const campaigns = data.byCampaignDetail

  // Top performer
  const top = campaigns[0]
  if (top) {
    insights.push({
      type: "success" as const,
      title: `🏆 Campagna TOP`,
      message: `"${top.campaign}" da ${top.source} genera ${formatMoney(top.totalRevenue)} con ${top.totalOrders} ordini (AOV: ${formatMoney(top.cpa)})`,
      action: `Aumenta il budget su questa campagna`
    })
  }

  // Campagna con ordini ma AOV basso
  const lowAov = campaigns.find(c => c.totalOrders >= 3 && c.cpa < data.avgOrderValue * 0.7)
  if (lowAov) {
    insights.push({
      type: "warning" as const,
      title: `⚠️ AOV Basso rilevato`,
      message: `"${lowAov.campaign}" ha un ordine medio di ${formatMoney(lowAov.cpa)} vs media ${formatMoney(data.avgOrderValue)}`,
      action: `Controlla le creatività — potrebbe attirare clienti sbagliati`
    })
  }

  // Campagna con 1 solo ordine
  const singleOrder = campaigns.filter(c => c.totalOrders === 1)
  if (singleOrder.length > 0) {
    insights.push({
      type: "info" as const,
      title: `👀 ${singleOrder.length} campagne con 1 solo ordine`,
      message: `Potrebbero essere test o campagne in fase di apprendimento`,
      action: `Aspetta almeno 5 conversioni prima di ottimizzare o spegnere`
    })
  }

  // Multi-touch: first click diverso da last click
  const multiTouch = data.recentPurchases.filter(p =>
    p.utm?.first_source && p.utm?.source &&
    p.utm.first_source !== p.utm.source
  )
  if (multiTouch.length > 0) {
    insights.push({
      type: "info" as const,
      title: `🔄 ${multiTouch.length} acquisti multi-touch rilevati`,
      message: `Questi clienti hanno avuto contatti da canali diversi prima di comprare`,
      action: `Valuta un modello di attribuzione lineare invece di last-click`
    })
  }

  // Ora migliore
  const bestHour = data.hourlyRevenue.reduce((a, b) => b.revenue > a.revenue ? b : a, { hour: 0, revenue: 0 })
  if (bestHour.revenue > 0) {
    insights.push({
      type: "info" as const,
      title: `⏰ Ora di picco: ${bestHour.hour}:00`,
      message: `La fascia oraria con più revenue è ${bestHour.hour}:00-${bestHour.hour + 1}:00`,
      action: `Concentra i budget ads e le pubblicazioni in questa fascia`
    })
  }

  // Direct alto = brand awareness funziona
  const directSource = data.bySource.find(s => s.source === "Direct")
  const totalOrders = data.totalPurchases
  if (directSource && directSource.purchases / totalOrders > 0.3) {
    insights.push({
      type: "success" as const,
      title: `💪 Brand Awareness forte`,
      message: `${((directSource.purchases / totalOrders) * 100).toFixed(0)}% degli ordini arriva da traffico diretto`,
      action: `Il brand è riconosciuto — continua a investire in contenuti organici`
    })
  }

  return insights
}

// ─── FUNZIONE PERCORSO ───────────────────────────────────────────────────────

function getJourneySteps(purchase: Purchase) {
  const first = {
    source: purchase.utm?.first_source || purchase.utm?.source || "direct",
    campaign: purchase.utm?.first_campaign || purchase.utm?.campaign || "",
    medium: purchase.utm?.first_medium || purchase.utm?.medium || "",
  }
  const last = {
    source: purchase.utm?.source || "direct",
    campaign: purchase.utm?.campaign || "",
    medium: purchase.utm?.medium || "",
    adset: purchase.utm?.adset_name || "",
    ad: purchase.utm?.ad_name || "",
  }

  const isMultiTouch = first.source !== last.source || first.campaign !== last.campaign
  return { first, last, isMultiTouch }
}

// ─── BADGE DECISIONE ─────────────────────────────────────────────────────────

function getDecisionBadge(campaign: CampaignDetail, avgOrderValue: number) {
  if (campaign.totalOrders >= 5 && campaign.cpa >= avgOrderValue) {
    return { text: "✅ SCALA", color: "bg-green-100 text-green-800", action: "Aumenta budget +20%" }
  }
  if (campaign.totalOrders >= 3 && campaign.cpa >= avgOrderValue * 0.8) {
    return { text: "📈 OTTIMIZZA", color: "bg-blue-100 text-blue-800", action: "Testa nuove creatività" }
  }
  if (campaign.totalOrders === 1) {
    return { text: "👀 OSSERVA", color: "bg-yellow-100 text-yellow-800", action: "Aspetta più dati" }
  }
  if (campaign.totalOrders >= 2 && campaign.cpa < avgOrderValue * 0.6) {
    return { text: "⚠️ ANALIZZA", color: "bg-orange-100 text-orange-800", action: "Controlla targeting" }
  }
  return { text: "🔄 IN CORSO", color: "bg-gray-100 text-gray-700", action: "Monitora" }
}

// ─── COMPONENTI UI ───────────────────────────────────────────────────────────

function KPICard({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: number }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
      {trend !== undefined && (
        <div className={`text-xs font-semibold mt-1 ${trend >= 0 ? "text-green-600" : "text-red-500"}`}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% vs periodo prec.
        </div>
      )}
    </div>
  )
}

function BarChart({ data, valueKey, labelKey, color = "#6366F1" }: {
  data: any[]; valueKey: string; labelKey: string; color?: string
}) {
  const max = Math.max(...data.map(d => d[valueKey]), 1)
  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <div className="w-24 text-right text-gray-500 truncate text-xs">{item[labelKey]}</div>
          <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
            <div
              className="h-5 rounded-full transition-all duration-700"
              style={{ width: `${(item[valueKey] / max) * 100}%`, backgroundColor: color }}
            />
            <span className="absolute right-2 top-0 bottom-0 flex items-center text-xs font-semibold text-gray-700">
              {typeof item[valueKey] === "number" && item[valueKey] > 100
                ? formatMoney(item[valueKey])
                : item[valueKey]}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── COMPONENTE PRINCIPALE ───────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [activeTab, setActiveTab] = useState<"overview"|"campaigns"|"journey"|"products">("overview")
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  // Filtri date
  const today = new Date()
  const [startDate, setStartDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
  )
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Periodo precedente per confronto
      const start = new Date(startDate)
      const end = new Date(endDate)
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const prevStart = new Date(start.getTime() - diffDays * 24 * 60 * 60 * 1000)
      const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000)

      const url = `/api/analytics/dashboard?startDate=${startDate}&endDate=${endDate}&compareStartDate=${prevStart.toISOString().split("T")[0]}&compareEndDate=${prevEnd.toISOString().split("T")[0]}&limit=1000`
      const res = await fetch(url)
      if (!res.ok) throw new Error("Errore caricamento dati")
      const json = await res.json()
      setData(json)
      setLastUpdate(new Date())
    } catch (err: any) {
      setError(err.message || "Errore sconosciuto")
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh ogni 60 secondi
  useEffect(() => {
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <div className="text-gray-500 text-sm">Caricamento analytics...</div>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-red-50 text-red-700 p-6 rounded-2xl max-w-md text-center">
        <div className="text-2xl mb-2">❌</div>
        <div className="font-semibold">{error}</div>
        <button onClick={fetchData} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Riprova</button>
      </div>
    </div>
  )

  if (!data) return null

  const insights = generateInsights(data)

  return (
    <div className="min-h-screen bg-gray-50 font-sans">

      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">📊 Not For Resale — Analytics</h1>
            <div className="text-xs text-gray-400 mt-0.5">
              Aggiornato alle {lastUpdate.toLocaleTimeString("it-IT")} •{" "}
              {data.meta.deduplicatedCount} ordini unici
              {data.meta.duplicatesRemoved > 0 && ` • ${data.meta.duplicatesRemoved} duplicati rimossi`}
            </div>
          </div>

          {/* Filtri data */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date" value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700"
            />
            <span className="text-gray-400 text-sm">→</span>
            <input
              type="date" value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700"
            />
            <button
              onClick={fetchData}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition"
            >
              Aggiorna
            </button>
            {/* Quick filters */}
            {[
              { label: "Oggi", days: 0 },
              { label: "7gg", days: 7 },
              { label: "30gg", days: 30 },
            ].map(({ label, days }) => (
              <button
                key={label}
                onClick={() => {
                  const end = new Date()
                  const start = new Date()
                  start.setDate(start.getDate() - days)
                  setStartDate(start.toISOString().split("T")[0])
                  setEndDate(end.toISOString().split("T")[0])
                }}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 transition"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            label="Ordini Totali"
            value={String(data.totalPurchases)}
            sub={`${data.uniqueCustomers} clienti unici`}
            trend={data.comparison?.purchasesPercent}
          />
          <KPICard
            label="Revenue"
            value={formatMoney(data.totalRevenue)}
            sub={`${data.byCampaignDetail.length} campagne attive`}
            trend={data.comparison?.revenuePercent}
          />
          <KPICard
            label="AOV Medio"
            value={formatMoney(data.avgOrderValue)}
            sub="Ordine medio"
          />
          <KPICard
            label="Campagna Top"
            value={data.byCampaignDetail[0]?.source || "—"}
            sub={data.byCampaignDetail[0]?.campaign?.slice(0, 20) || "Nessuna campagna"}
          />
        </div>

        {/* INSIGHTS / CONSIGLI */}
        {insights.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((insight, i) => (
              <div
                key={i}
                className={`rounded-2xl p-4 border ${
                  insight.type === "success" ? "bg-green-50 border-green-100" :
                  insight.type === "warning" ? "bg-yellow-50 border-yellow-100" :
                  insight.type === "danger"  ? "bg-red-50 border-red-100" :
                  "bg-blue-50 border-blue-100"
                }`}
              >
                <div className="font-semibold text-sm text-gray-800">{insight.title}</div>
                <div className="text-xs text-gray-600 mt-1">{insight.message}</div>
                {insight.action && (
                  <div className="text-xs font-medium text-indigo-600 mt-2">💡 {insight.action}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* TABS */}
        <div className="flex gap-2 border-b border-gray-200">
          {[
            { id: "overview",   label: "📊 Overview" },
            { id: "campaigns",  label: "🎯 Campagne" },
            { id: "journey",    label: "🗺️ Percorso Acquisto" },
            { id: "products",   label: "📦 Prodotti" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Revenue per fonte */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-800 mb-4">Revenue per Fonte</h3>
              <div className="space-y-3">
                {data.bySource.map((s, i) => {
                  const pct = (s.revenue / data.totalRevenue) * 100
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">
                          {sourceEmoji[s.source] || "📌"} {s.source}
                        </span>
                        <span className="text-gray-500">{formatMoney(s.revenue)} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: sourceColor[s.source] || "#6366F1" }}
                        />
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{s.purchases} ordini</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Revenue giornaliera */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-800 mb-4">Revenue Giornaliera</h3>
              {data.dailyRevenue.length > 0 ? (
                <BarChart
                  data={data.dailyRevenue.slice(-14)}
                  valueKey="revenue"
                  labelKey="date"
                  color="#6366F1"
                />
              ) : (
                <div className="text-gray-400 text-sm text-center py-8">Nessun dato disponibile</div>
              )}
            </div>

            {/* Revenue per ora */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-800 mb-4">Distribuzione Oraria</h3>
              <div className="flex items-end gap-1 h-24">
                {data.hourlyRevenue.map((h) => {
                  const max = Math.max(...data.hourlyRevenue.map(x => x.revenue), 1)
                  const height = (h.revenue / max) * 100
                  return (
                    <div key={h.hour} className="flex-1 flex flex-col items-center gap-1" title={`${h.hour}:00 — ${formatMoney(h.revenue)}`}>
                      <div
                        className="w-full rounded-t bg-indigo-400 hover:bg-indigo-600 transition"
                        style={{ height: `${height}%`, minHeight: h.revenue > 0 ? "4px" : "0" }}
                      />
                      {h.hour % 6 === 0 && (
                        <div className="text-xs text-gray-400">{h.hour}h</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Prodotti top */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-800 mb-4">Top Prodotti</h3>
              <BarChart
                data={data.byProduct.slice(0, 8)}
                valueKey="revenue"
                labelKey="title"
                color="#10B981"
              />
            </div>
          </div>
        )}

        {/* TAB: CAMPAGNE */}
        {activeTab === "campaigns" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Performance Campagne — Decisioni Immediate</h3>
              <p className="text-xs text-gray-400 mt-0.5">Ogni riga mostra il percorso fonte → campagna → ad set → creatività con consiglio operativo</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Fonte</th>
                    <th className="px-4 py-3 text-left">Campagna</th>
                    <th className="px-4 py-3 text-left">Ad Set</th>
                    <th className="px-4 py-3 text-left">Creatività</th>
                    <th className="px-4 py-3 text-right">Ordini</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">AOV</th>
                    <th className="px-4 py-3 text-center">Decisione</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.byCampaignDetail.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-400">
                        🔍 Nessuna campagna trovata nel periodo selezionato
                      </td>
                    </tr>
                  ) : data.byCampaignDetail.map((campaign, i) => {
                    const badge = getDecisionBadge(campaign, data.avgOrderValue)
                    const adSets = [...new Set(campaign.orders.map(o => o.adSet).filter(Boolean))]
                    const adNames = [...new Set(campaign.orders.map(o => o.adName).filter(Boolean))]
                    const isExpanded = expandedOrder === `campaign-${i}`

                    return (
                      <>
                        <tr
                          key={i}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => setExpandedOrder(isExpanded ? null : `campaign-${i}`)}
                        >
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              <span style={{ color: sourceColor[campaign.source] }}>
                                {sourceEmoji[campaign.source] || "📌"}
                              </span>
                              {campaign.source}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800 max-w-48 truncate" title={campaign.campaign}>
                              {campaign.campaign || "—"}
                            </div>
                            {campaign.campaignId && (
                              <div className="text-xs text-gray-400">ID: {campaign.campaignId}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {adSets.length > 0 ? (
                              <div>
                                {adSets.slice(0, 2).map((a, j) => (
                                  <div key={j} className="truncate max-w-32" title={a!}>{a}</div>
                                ))}
                                {adSets.length > 2 && <div className="text-gray-400">+{adSets.length - 2} altri</div>}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {adNames.length > 0 ? (
                              <div>
                                {adNames.slice(0, 2).map((a, j) => (
                                  <div key={j} className="truncate max-w-32" title={a!}>{a}</div>
                                ))}
                                {adNames.length > 2 && <div className="text-gray-400">+{adNames.length - 2} altre</div>}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{campaign.totalOrders}</td>
                          <td className="px-4 py-3 text-right font-semibold text-green-700">{formatMoney(campaign.totalRevenue)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatMoney(campaign.cpa)}</td>
                          <td className="px-4 py-3 text-center">
                            <div className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${badge.color}`}>
                              {badge.text}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">{badge.action}</div>
                          </td>
                        </tr>

                        {/* RIGA ESPANSA - ordini dettagliati */}
                        {isExpanded && (
                          <tr key={`expanded-${i}`}>
                            <td colSpan={8} className="bg-gray-50 px-6 py-4">
                              <div className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wider">
                                Ordini di questa campagna
                              </div>
                              <div className="space-y-2">
                                {campaign.orders.map((order, j) => (
                                  <div key={j} className="bg-white rounded-lg p-3 border border-gray-100 flex flex-wrap gap-4 text-xs">
                                    <div>
                                      <span className="text-gray-400">Ordine</span>
                                      <div className="font-semibold">#{order.orderNumber || "—"}</div>
                                    </div>
                                    <div>
                                      <span className="text-gray-400">Valore</span>
                                      <div className="font-semibold text-green-700">{formatMoney(order.value)}</div>
                                    </div>
                                    <div>
                                      <span className="text-gray-400">Data</span>
                                      <div>{formatDate(order.timestamp)}</div>
                                    </div>
                                    {order.adSet && (
                                      <div>
                                        <span className="text-gray-400">Ad Set</span>
                                        <div className="max-w-32 truncate">{order.adSet}</div>
                                      </div>
                                    )}
                                    {order.adName && (
                                      <div>
                                        <span className="text-gray-400">Creatività</span>
                                        <div className="max-w-32 truncate">{order.adName}</div>
                                      </div>
                                    )}
                                    {order.customer && (
                                      <div>
                                        <span className="text-gray-400">Cliente</span>
                                        <div className="truncate max-w-32">{order.customer}</div>
                                      </div>
                                    )}
                                    {order.fbclid && (
                                      <div>
                                        <span className="text-gray-400">fbclid</span>
                                        <div className="text-indigo-500 truncate max-w-24">{order.fbclid.slice(0, 10)}...</div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: PERCORSO ACQUISTO */}
        {activeTab === "journey" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-800 mb-1">🗺️ Percorso di ogni acquisto</h3>
              <p className="text-xs text-gray-400 mb-4">First touch → Last touch → Acquisto. Mostra come ogni cliente ti ha trovato e cosa lo ha convinto a comprare.</p>

              <div className="space-y-3">
                {data.recentPurchases.slice(0, 30).map((purchase, i) => {
                  const { first, last, isMultiTouch } = getJourneySteps(purchase)
                  const key = purchase.orderId || purchase.sessionId || String(i)

                  return (
                    <div
                      key={key}
                      className="border border-gray-100 rounded-xl p-4 hover:border-indigo-200 transition cursor-pointer"
                      onClick={() => setExpandedOrder(expandedOrder === key ? null : key)}
                    >
                      {/* Header ordine */}
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-gray-800">
                            #{purchase.orderNumber || purchase.orderId?.slice(-6) || "—"}
                          </span>
                          <span className="text-sm font-bold text-green-600">{formatMoney(purchase.value)}</span>
                          <span className="text-xs text-gray-400">{formatDate(purchase.timestamp)}</span>
                        </div>
                        {isMultiTouch && (
                          <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full font-medium">
                            🔄 Multi-touch
                          </span>
                        )}
                      </div>

                      {/* Percorso visuale */}
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        {/* PRIMO CLICK */}
                        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-center min-w-24">
                          <div className="text-xs text-gray-400 mb-0.5">1° Touch</div>
                          <div className="font-semibold text-blue-700">
                            {sourceEmoji[first.source] || "📌"} {first.source}
                          </div>
                          {first.campaign && (
                            <div className="text-xs text-gray-500 truncate max-w-28" title={first.campaign}>
                              {first.campaign}
                            </div>
                          )}
                        </div>

                        {/* Freccia */}
                        <div className="text-gray-300 text-lg">→</div>

                        {/* ULTIMO CLICK */}
                        <div className={`border rounded-lg px-3 py-2 text-center min-w-24 ${
                          isMultiTouch ? "bg-indigo-50 border-indigo-100" : "bg-gray-50 border-gray-100"
                        }`}>
                          <div className="text-xs text-gray-400 mb-0.5">Last Touch</div>
                          <div className={`font-semibold ${isMultiTouch ? "text-indigo-700" : "text-gray-700"}`}>
                            {sourceEmoji[last.source] || "📌"} {last.source}
                          </div>
                          {last.campaign && (
                            <div className="text-xs text-gray-500 truncate max-w-28" title={last.campaign}>
                              {last.campaign}
                            </div>
                          )}
                          {last.adset && (
                            <div className="text-xs text-indigo-400 truncate max-w-28" title={last.adset}>
                              📂 {last.adset}
                            </div>
                          )}
                          {last.ad && (
                            <div className="text-xs text-indigo-400 truncate max-w-28" title={last.ad}>
                              🎨 {last.ad}
                            </div>
                          )}
                        </div>

                        {/* Freccia */}
                        <div className="text-gray-300 text-lg">→</div>

                        {/* ACQUISTO */}
                        <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-center min-w-24">
                          <div className="text-xs text-gray-400 mb-0.5">Acquisto</div>
                          <div className="font-bold text-green-700">{formatMoney(purchase.value)}</div>
                          {purchase.customer?.city && (
                            <div className="text-xs text-gray-400">📍 {purchase.customer.city}</div>
                          )}
                        </div>
                      </div>

                      {/* DETTAGLIO ESPANSO */}
                      {expandedOrder === key && (
                        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <div className="text-gray-400 uppercase tracking-wider mb-1">Cliente</div>
                            <div>{purchase.customer?.fullName || "—"}</div>
                            <div className="text-gray-400">{purchase.customer?.email || "—"}</div>
                          </div>
                          <div>
                            <div className="text-gray-400 uppercase tracking-wider mb-1">UTM completi</div>
                            <div>src: {purchase.utm?.source || "—"}</div>
                            <div>med: {purchase.utm?.medium || "—"}</div>
                            <div>camp: {purchase.utm?.campaign || "—"}</div>
                          </div>
                          <div>
                            <div className="text-gray-400 uppercase tracking-wider mb-1">Prodotti</div>
                            {purchase.items?.map((item, j) => (
                              <div key={j}>{item.quantity}x {item.title}</div>
                            )) || <div>—</div>}
                          </div>
                          <div>
                            <div className="text-gray-400 uppercase tracking-wider mb-1">Click IDs</div>
                            {purchase.utm?.fbclid && <div>fb: {purchase.utm.fbclid.slice(0, 12)}...</div>}
                            {purchase.utm?.gclid && <div>g: {purchase.utm.gclid.slice(0, 12)}...</div>}
                            {purchase.utm?.ttclid && <div>tt: {purchase.utm.ttclid.slice(0, 12)}...</div>}
                            {!purchase.utm?.fbclid && !purchase.utm?.gclid && !purchase.utm?.ttclid && <div>—</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB: PRODOTTI */}
        {activeTab === "products" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">📦 Performance Prodotti</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Prodotto</th>
                  <th className="px-4 py-3 text-right">Quantità</th>
                  <th className="px-4 py-3 text-right">Ordini</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Prezzo medio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.byProduct.map((product, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{product.title}</td>
                    <td className="px-4 py-3 text-right">{product.quantity}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{product.orders}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">{formatMoney(product.revenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {formatMoney(product.revenue / product.orders)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  )
}

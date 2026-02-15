// src/app/api/analytics/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
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

export async function GET(req: NextRequest) {
  try {
    const origin = req.headers.get("origin")
    const { searchParams } = new URL(req.url)

    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const compareStartDate = searchParams.get('compareStartDate')
    const compareEndDate = searchParams.get('compareEndDate')
    const limit = parseInt(searchParams.get('limit') || '1000')

    console.log('[Dashboard API] 📊 Caricamento analytics...')

    // Query principale
    let query = db.collection('purchaseEvents').orderBy('timestamp', 'desc')

    if (startDate) {
      query = query.where('timestamp', '>=', startDate)
    }
    if (endDate) {
      const endDateTime = new Date(endDate)
      endDateTime.setHours(23, 59, 59, 999)
      query = query.where('timestamp', '<=', endDateTime.toISOString())
    }

    const snapshot = await query.limit(limit * 2).get() // x2 per gestire duplicati

    // Query di confronto (se richiesta)
    let compareSnapshot = null
    if (compareStartDate && compareEndDate) {
      let compareQuery = db.collection('purchaseEvents').orderBy('timestamp', 'desc')
      compareQuery = compareQuery.where('timestamp', '>=', compareStartDate)
      const compareEndDateTime = new Date(compareEndDate)
      compareEndDateTime.setHours(23, 59, 59, 999)
      compareQuery = compareQuery.where('timestamp', '<=', compareEndDateTime.toISOString())
      compareSnapshot = await compareQuery.limit(limit * 2).get()
    }

    if (snapshot.empty) {
      return NextResponse.json(
        {
          totalPurchases: 0,
          totalRevenue: 0,
          avgOrderValue: 0,
          uniqueCustomers: 0,
          byCampaign: [],
          bySource: [],
          byAd: [],
          byProduct: [],
          byCampaignDetail: [],
          recentPurchases: [],
          dailyRevenue: [],
          hourlyRevenue: [],
          comparison: null,
          meta: { deduplicatedCount: 0, duplicatesRemoved: 0 }
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

    // ═══════════════════════════════════════════════════════════
    // ✅ DEDUPLICA ORDINI (FIX PRINCIPALE)
    // ═══════════════════════════════════════════════════════════
    const uniqueOrders = new Map()
    let duplicatesRemoved = 0

    snapshot.docs.forEach((doc) => {
      const data = doc.data()
      // ✅ FIX: usa doc.id come fallback invece di skippare ordini
      const orderId = data.orderId || data.shopifyOrderId || data.sessionId || doc.id

      // Ora orderId è SEMPRE valorizzato, non skippa mai ordini

      // Se già esiste, tieni quello con più dati
      if (!uniqueOrders.has(orderId)) {
        uniqueOrders.set(orderId, { id: doc.id, ...data })
      } else {
        duplicatesRemoved++
        const existing = uniqueOrders.get(orderId)
        
        // Aggiorna se il nuovo ha orderNumber e il vecchio no
        if (data.orderNumber && !existing.orderNumber) {
          uniqueOrders.set(orderId, { id: doc.id, ...data })
        }
      }
    })

    const purchases = Array.from(uniqueOrders.values())

    console.log(`[Dashboard API] 📦 Ordini totali: ${snapshot.size}`)
    console.log(`[Dashboard API] ✅ Ordini unici: ${purchases.length}`)
    console.log(`[Dashboard API] 🗑️ Duplicati rimossi: ${duplicatesRemoved}`)

    // ═══════════════════════════════════════════════════════════
    // ✅ NORMALIZZA SORGENTI (Facebook/Instagram/notforresale.it → Meta)
    // ═══════════════════════════════════════════════════════════
    const normalizeSource = (purchase: any) => {
      const source = (purchase.utm?.source || "").toLowerCase()
      const medium = (purchase.utm?.medium || "").toLowerCase()
      const campaignId = purchase.utm?.campaign_id || ""

      // Se ha Campaign ID Meta (formato 1202...) → Meta
      if (campaignId && /^120\d{12,}$/.test(campaignId)) {
        return "Meta"
      }

      // Facebook/Instagram espliciti
      if (source === "facebook" || source === "ig" || source === "instagram" || source === "fb") {
        return "Meta"
      }

      // Referral da notforresale.it con campaign ID = Meta Ads
      if (source.includes("notforresale.it") && campaignId) {
        return "Meta"
      }

      // Medium paid = probabile Meta se source è ambiguo
      if (medium === "paid" && !source.includes("google") && !source.includes("tiktok")) {
        return "Meta"
      }

      // Google
      if (source.includes("google") || source.includes("bing")) {
        return "Google"
      }

      // Direct/Organic
      if (!source || source === "direct" || source === "(direct)") {
        return "Direct"
      }

      // Referral generico
      if (source.includes("www.") || source.includes(".com") || source.includes(".it")) {
        return "Referral"
      }

      // Capitalizza prima lettera
      return source.charAt(0).toUpperCase() + source.slice(1)
    }

    // Applica normalizzazione
    purchases.forEach((purchase: any) => {
      purchase.normalizedSource = normalizeSource(purchase)
    })

    // ═══════════════════════════════════════════════════════════
    // AGGREGAZIONI
    // ═══════════════════════════════════════════════════════════

    let totalRevenue = 0
    const byCampaign: Record<string, any> = {}
    const bySource: Record<string, any> = {}
    const byAd: Record<string, any> = {}
    const byProduct: Record<string, any> = {}
    const byCampaignDetail: Record<string, any> = {}
    const dailyRevenue: Record<string, number> = {}
    const hourlyRevenue: Record<number, number> = {}
    const customerEmails = new Set()

    purchases.forEach((purchase: any) => {
      const value = purchase.value || 0
      totalRevenue += value

      // Customer tracking
      if (purchase.customer?.email) {
        customerEmails.add(purchase.customer.email)
      }

      // ✅ USA SORGENTE NORMALIZZATA
      const campaign = purchase.utm?.campaign || 'direct'
      const source = purchase.normalizedSource || 'Direct'
      const medium = purchase.utm?.medium || 'none'
      const campaignId = purchase.utm?.campaign_id || ''

      // ✅ CHIAVE UNIVOCA: Campaign ID (se esiste) altrimenti Campaign + Source
      const campaignKey = campaignId || `${source}__${campaign}`

      // Aggregazione per campagna
      if (!byCampaign[campaignKey]) {
        byCampaign[campaignKey] = {
          campaign,
          source,
          medium,
          campaignId: campaignId || null,
          purchases: 0,
          revenue: 0,
          orders: []
        }
      }

      byCampaign[campaignKey].purchases += 1
      byCampaign[campaignKey].revenue += value
      byCampaign[campaignKey].orders.push({
        orderNumber: purchase.orderNumber,
        value,
        timestamp: purchase.timestamp,
        adSet: purchase.utm?.adset_name || null,
        adName: purchase.utm?.ad_name || null,
      })

      // Aggregazione per sorgente (normalizzata)
      if (!bySource[source]) {
        bySource[source] = {
          source,
          purchases: 0,
          revenue: 0
        }
      }
      bySource[source].purchases += 1
      bySource[source].revenue += value

      // Aggregazione per ad
      const adId = purchase.utm?.ad_id || purchase.utm?.content || null
      if (adId) {
        if (!byAd[adId]) {
          byAd[adId] = {
            adId,
            campaign,
            source,
            purchases: 0,
            revenue: 0
          }
        }
        byAd[adId].purchases += 1
        byAd[adId].revenue += value
      }

      // Aggregazione per prodotto
      if (purchase.items && Array.isArray(purchase.items)) {
        purchase.items.forEach((item: any) => {
          const productKey = item.title || 'Unknown'
          if (!byProduct[productKey]) {
            byProduct[productKey] = {
              title: productKey,
              quantity: 0,
              revenue: 0,
              orders: 0
            }
          }
          byProduct[productKey].quantity += item.quantity || 0
          byProduct[productKey].revenue += (item.linePriceCents || item.priceCents || 0) / 100
          byProduct[productKey].orders += 1
        })
      }

      // ═══════════════════════════════════════════════════════════
      // ✅ AGGREGAZIONE DETTAGLIATA CAMPAGNE (con Ad Set e Ad Name)
      // ═══════════════════════════════════════════════════════════
      
      const adsetName = purchase.utm?.adset_name || null
      const adName = purchase.utm?.ad_name || null
      const adsetId = purchase.utm?.adset_id || null
      const fbclid = purchase.utm?.fbclid || null
      const gclid = purchase.utm?.gclid || null

      // ✅ USA Campaign ID come chiave se disponibile
      const campaignDetailKey = campaignId || `${source}__${campaign}`

      if (!byCampaignDetail[campaignDetailKey]) {
        byCampaignDetail[campaignDetailKey] = {
          campaign,
          source,
          medium,
          campaignId: campaignId || null,
          orders: [],
          totalRevenue: 0,
          totalOrders: 0,
        }
      }

      byCampaignDetail[campaignDetailKey].totalRevenue += value
      byCampaignDetail[campaignDetailKey].totalOrders += 1

      byCampaignDetail[campaignDetailKey].orders.push({
        orderNumber: purchase.orderNumber,
        orderId: purchase.orderId,
        sessionId: purchase.sessionId,
        value,
        timestamp: purchase.timestamp,
        adSet: adsetName,
        adName: adName,
        campaignId: campaignId,
        adsetId: adsetId,
        adId: adId,
        fbclid: fbclid,
        gclid: gclid,
        customer: purchase.customer?.email || null,
        items: purchase.items || [],
      })

      // Aggregazione giornaliera
      const date = purchase.timestamp?.split('T')[0] || 'unknown'
      if (!dailyRevenue[date]) {
        dailyRevenue[date] = 0
      }
      dailyRevenue[date] += value

      // Aggregazione oraria
      if (purchase.timestamp) {
        const hour = new Date(purchase.timestamp).getHours()
        if (!hourlyRevenue[hour]) {
          hourlyRevenue[hour] = 0
        }
        hourlyRevenue[hour] += value
      }
    })

    // Ordina aggregazioni
    const campaignStats = Object.values(byCampaign)
      .sort((a: any, b: any) => b.revenue - a.revenue)

    const sourceStats = Object.values(bySource)
      .sort((a: any, b: any) => b.revenue - a.revenue)

    const adStats = Object.values(byAd)
      .sort((a: any, b: any) => b.revenue - a.revenue)

    const productStats = Object.values(byProduct)
      .sort((a: any, b: any) => b.revenue - a.revenue)

    // ✅ Campaign Detail Stats (ordinati)
    const campaignDetailStats = Object.values(byCampaignDetail)
      .map((camp: any) => ({
        campaign: camp.campaign,
        source: camp.source,
        medium: camp.medium,
        campaignId: camp.campaignId,
        totalRevenue: parseFloat(camp.totalRevenue.toFixed(2)),
        totalOrders: camp.totalOrders,
        cpa: camp.totalOrders > 0 
          ? parseFloat((camp.totalRevenue / camp.totalOrders).toFixed(2)) 
          : 0,
        orders: camp.orders.sort((a: any, b: any) => 
          b.timestamp.localeCompare(a.timestamp)
        )
      }))
      .sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)

    // Daily revenue array
    const dailyRevenueArray = Object.entries(dailyRevenue)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Hourly revenue array
    const hourlyRevenueArray = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      revenue: hourlyRevenue[i] || 0
    }))

    // ═══════════════════════════════════════════════════════════
    // ✅ COMPARISON DATA (con deduplica)
    // ═══════════════════════════════════════════════════════════

    let comparison = null
    if (compareSnapshot && !compareSnapshot.empty) {
      // Deduplica anche il periodo di confronto
      const compareUnique = new Map()
      compareSnapshot.docs.forEach((doc: any) => {
        const data = doc.data()
        // ✅ FIX: usa doc.id come fallback anche qui
        const orderId = data.orderId || data.shopifyOrderId || data.sessionId || doc.id
        if (!compareUnique.has(orderId)) {
          compareUnique.set(orderId, data)
        }
      })

      const comparePurchases = Array.from(compareUnique.values())
      const compareRevenue = comparePurchases.reduce((sum: number, p: any) => sum + (p.value || 0), 0)
      const compareCount = comparePurchases.length
      const compareAvgOrder = compareCount > 0 ? compareRevenue / compareCount : 0

      comparison = {
        purchases: compareCount,
        revenue: parseFloat(compareRevenue.toFixed(2)),
        avgOrderValue: parseFloat(compareAvgOrder.toFixed(2)),
        purchasesDiff: purchases.length - compareCount,
        revenueDiff: parseFloat((totalRevenue - compareRevenue).toFixed(2)),
        avgOrderDiff: parseFloat(((totalRevenue / purchases.length) - compareAvgOrder).toFixed(2)),
        purchasesPercent: compareCount > 0 ? parseFloat((((purchases.length - compareCount) / compareCount) * 100).toFixed(1)) : 0,
        revenuePercent: compareRevenue > 0 ? parseFloat((((totalRevenue - compareRevenue) / compareRevenue) * 100).toFixed(1)) : 0,
      }
    }

    // ═══════════════════════════════════════════════════════════
    // RESPONSE FINALE
    // ═══════════════════════════════════════════════════════════

    const response = {
      totalPurchases: purchases.length,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      avgOrderValue: parseFloat((totalRevenue / purchases.length).toFixed(2)),
      uniqueCustomers: customerEmails.size,
      byCampaign: campaignStats,
      bySource: sourceStats,
      byAd: adStats,
      byProduct: productStats.slice(0, 10),
      byCampaignDetail: campaignDetailStats,
      recentPurchases: purchases.slice(0, 50),
      dailyRevenue: dailyRevenueArray,
      hourlyRevenue: hourlyRevenueArray,
      comparison,
      dateRange: {
        start: startDate || 'all',
        end: endDate || 'all'
      },
      meta: {
        deduplicatedCount: purchases.length,
        duplicatesRemoved: duplicatesRemoved,
      }
    }

    console.log('[Dashboard API] ✅ Analytics elaborate')
    console.log(`[Dashboard API] 📊 Campagne uniche: ${campaignStats.length}`)
    console.log(`[Dashboard API] 🎯 Campagne con dettagli: ${campaignDetailStats.length}`)

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(origin),
      },
    })
  } catch (err) {
    console.error('[Dashboard API] ❌ Errore:', err)
    return NextResponse.json(
      { 
        error: 'Errore caricamento dashboard',
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

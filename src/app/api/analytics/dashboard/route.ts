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
    
    // Parametri filtro
    const startDate = searchParams.get('startDate') // es: 2026-02-01
    const endDate = searchParams.get('endDate')     // es: 2026-02-28
    const limit = parseInt(searchParams.get('limit') || '100')
    
    console.log('[Dashboard API] 📊 Caricamento analytics...')
    
    let query = db.collection('purchaseEvents').orderBy('timestamp', 'desc')
    
    // Filtri data
    if (startDate) {
      query = query.where('timestamp', '>=', startDate)
    }
    if (endDate) {
      const endDateTime = new Date(endDate)
      endDateTime.setHours(23, 59, 59, 999)
      query = query.where('timestamp', '<=', endDateTime.toISOString())
    }
    
    const snapshot = await query.limit(limit).get()
    
    if (snapshot.empty) {
      console.log('[Dashboard API] ⚠️ Nessun dato trovato')
      return NextResponse.json(
        {
          totalPurchases: 0,
          totalRevenue: 0,
          avgOrderValue: 0,
          byCampaign: [],
          bySource: [],
          byAd: [],
          recentPurchases: [],
          dailyRevenue: []
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
    
    const purchases = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    console.log(`[Dashboard API] 📦 ${purchases.length} purchases trovati`)

    // AGGREGAZIONI
    let totalRevenue = 0
    const byCampaign: Record<string, any> = {}
    const bySource: Record<string, any> = {}
    const byAd: Record<string, any> = {}
    const dailyRevenue: Record<string, number> = {}
    
    purchases.forEach((purchase: any) => {
      const value = purchase.value || 0
      totalRevenue += value
      
      // Aggregazione per campagna
      const campaign = purchase.utm?.campaign || 'direct'
      const source = purchase.utm?.source || 'direct'
      const medium = purchase.utm?.medium || 'none'
      const campaignKey = `${source}/${medium}/${campaign}`
      
      if (!byCampaign[campaignKey]) {
        byCampaign[campaignKey] = {
          campaign,
          source,
          medium,
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
        timestamp: purchase.timestamp
      })
      
      // Aggregazione per sorgente
      if (!bySource[source]) {
        bySource[source] = {
          source,
          purchases: 0,
          revenue: 0
        }
      }
      bySource[source].purchases += 1
      bySource[source].revenue += value
      
      // Aggregazione per ad (utm_content)
      if (purchase.utm?.content) {
        const adId = purchase.utm.content
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
      
      // Aggregazione giornaliera
      const date = purchase.timestamp?.split('T')[0] || 'unknown'
      if (!dailyRevenue[date]) {
        dailyRevenue[date] = 0
      }
      dailyRevenue[date] += value
    })

    // Ordina per revenue
    const campaignStats = Object.values(byCampaign)
      .sort((a: any, b: any) => b.revenue - a.revenue)
      
    const sourceStats = Object.values(bySource)
      .sort((a: any, b: any) => b.revenue - a.revenue)
      
    const adStats = Object.values(byAd)
      .sort((a: any, b: any) => b.revenue - a.revenue)

    // Daily revenue come array
    const dailyRevenueArray = Object.entries(dailyRevenue)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const response = {
      totalPurchases: purchases.length,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      avgOrderValue: parseFloat((totalRevenue / purchases.length).toFixed(2)),
      byCampaign: campaignStats,
      bySource: sourceStats,
      byAd: adStats,
      recentPurchases: purchases.slice(0, 20),
      dailyRevenue: dailyRevenueArray,
      dateRange: {
        start: startDate || 'all',
        end: endDate || 'all'
      }
    }

    console.log('[Dashboard API] ✅ Analytics elaborate')

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

// Propertyware Open REST API -- read-only work order lookup, so a new
// inspection's property address comes from the work order itself instead
// of being retyped. Ported from PropWrench's lib/propertyware.ts (verified
// live against GPM's real account 2026-09-29, including catching a typo in
// a manually-entered address) and uses the same read-only credentials --
// PropWrench's separate PROPERTYWARE_WRITE_* pair is deliberately not
// needed or used here.
//
// Auth is three headers, not a bearer token (confirmed by the API's own 401
// message): x-propertyware-client-id, x-propertyware-client-secret,
// x-propertyware-system-id.
//
// Work orders can only be fetched by Propertyware's internal id, not by the
// human-facing work order number GPM actually writes down. But GET
// /workorders supports `orderby=number`, and that ordering is a true
// monotonic sort (verified against 109k+ real records in PropWrench), so a
// binary search over `offset` with `limit=1` finds an exact number in ~17
// requests instead of paging through everything.

const BASE_URL = 'https://api.propertyware.com/pw/api/rest/v1'

export type PropertywareWorkOrder = {
  id: number
  number: number
  description: string
  status: string
  buildingID: number | null
}

export type PropertywareAddress = { propertyName: string; propertyAddress: string }

function getCredentials() {
  const clientId = process.env.PROPERTYWARE_CLIENT_ID
  const clientSecret = process.env.PROPERTYWARE_CLIENT_SECRET
  const systemId = process.env.PROPERTYWARE_SYSTEM_ID
  if (!clientId || !clientSecret || !systemId) {
    throw new Error('PROPERTYWARE_CLIENT_ID / PROPERTYWARE_CLIENT_SECRET / PROPERTYWARE_SYSTEM_ID is not set')
  }
  return { clientId, clientSecret, systemId }
}

async function pwFetch(path: string): Promise<Response> {
  const { clientId, clientSecret, systemId } = getCredentials()
  return fetch(`${BASE_URL}${path}`, {
    headers: {
      'x-propertyware-client-id': clientId,
      'x-propertyware-client-secret': clientSecret,
      'x-propertyware-system-id': systemId,
    },
    cache: 'no-store',
  })
}

async function fetchWorkOrderAt(offset: number): Promise<PropertywareWorkOrder | null> {
  const res = await pwFetch(`/workorders?orderby=number&limit=1&offset=${offset}`)
  if (!res.ok) throw new Error(`Propertyware API error (${res.status}) fetching work orders at offset ${offset}.`)
  const data = (await res.json()) as PropertywareWorkOrder[]
  return data[0] ?? null
}

const RECENT_BATCH_SIZE = 500 // Propertyware's documented max `limit`

// Checks the most recent batch first (one request) -- almost every lookup is
// for a work order that was just created -- then falls back to the full
// binary search for an older number.
export async function findWorkOrderByNumber(targetNumber: number): Promise<PropertywareWorkOrder | null> {
  const countRes = await pwFetch('/workorders?limit=1')
  if (!countRes.ok) throw new Error(`Propertyware API error (${countRes.status}) fetching work order count.`)
  const totalCount = Number(countRes.headers.get('x-total-count') ?? 0)
  if (totalCount <= 0) return null

  const recentOffset = Math.max(0, totalCount - RECENT_BATCH_SIZE)
  const recentRes = await pwFetch(`/workorders?orderby=number&limit=${RECENT_BATCH_SIZE}&offset=${recentOffset}`)
  if (!recentRes.ok) throw new Error(`Propertyware API error (${recentRes.status}) fetching recent work orders.`)
  const recent = (await recentRes.json()) as PropertywareWorkOrder[]
  const recentMatch = recent.find((wo) => wo.number === targetNumber)
  if (recentMatch) return recentMatch
  if (recent.length > 0 && targetNumber >= recent[0].number) return null

  let lo = 0
  let hi = recentOffset - 1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const wo = await fetchWorkOrderAt(mid)
    if (!wo) {
      hi = mid - 1
      continue
    }
    if (wo.number === targetNumber) return wo
    if (wo.number < targetNumber) lo = mid + 1
    else hi = mid - 1
  }
  return null
}

// The building's real mailing address -- the work order's own `location`
// field is an internal label, not a street address (e.g. "WAYNEVEST
// BEVERLY35852" vs. the real "35852 Beverly Rd").
export async function getBuildingAddress(buildingId: number): Promise<PropertywareAddress | null> {
  const res = await pwFetch(`/buildings/${buildingId}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Propertyware API error (${res.status}) fetching building ${buildingId}.`)
  const building = await res.json()
  const addr = building.address as
    | { address?: string; addressCont?: string; city?: string; stateRegion?: string; postalCode?: string }
    | undefined
  if (!addr?.address) return null
  const line2 = addr.addressCont ? ` ${addr.addressCont}` : ''
  const cityStateZip = [addr.city, addr.stateRegion].filter(Boolean).join(', ') + (addr.postalCode ? ` ${addr.postalCode}` : '')
  return {
    propertyName: typeof building.name === 'string' ? building.name : '',
    propertyAddress: `${addr.address}${line2}, ${cityStateZip}`.trim(),
  }
}

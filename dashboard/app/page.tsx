import { sql } from '@/lib/db'
import Link from 'next/link'

// This lists live database state for an internal review tool — never serve a
// stale build-time snapshot.
export const dynamic = 'force-dynamic'

type Inspection = {
  id: string
  job_number: string
  property_address: string
  inspection_date: string
  inspector_name: string
  status: string
}

export default async function Home() {
  const inspections = (await sql`
    select * from inspections order by created_at desc
  `) as unknown as Inspection[]

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">PropInspecAI — Inspections</h1>
      {inspections.length === 0 ? (
        <p className="text-gray-600">No inspections yet.</p>
      ) : (
        <ul className="space-y-2">
          {inspections.map((i) => (
            <li key={i.id} className="border rounded p-3">
              <Link href={`/inspections/${i.id}`} className="text-blue-600 underline font-medium">
                {i.property_address}
              </Link>
              <div className="text-sm text-gray-600">
                Job {i.job_number} · {i.inspector_name} ·{' '}
                {new Date(i.inspection_date).toLocaleDateString('en-US', { timeZone: 'UTC' })} · {i.status}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

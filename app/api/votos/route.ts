import { posters } from "@/lib/posters"
import { readTotals } from "@/lib/votes"

export async function GET() {
  const totals = await readTotals()
  return Response.json(
    Object.fromEntries(
      posters.map(({ id }) => [id, totals[id] ?? { total: 0, points: 0 }])
    ),
    { headers: { "Cache-Control": "no-store" } }
  )
}

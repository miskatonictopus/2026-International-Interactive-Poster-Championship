import { posters } from "@/lib/posters"
import { readVotes, voteTotals } from "@/lib/votes"

export async function GET() {
  const votes = await readVotes()
  return Response.json(
    Object.fromEntries(posters.map(({ id }) => [id, voteTotals(votes, id)])),
    { headers: { "Cache-Control": "no-store" } }
  )
}

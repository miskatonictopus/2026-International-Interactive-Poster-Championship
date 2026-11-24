import { timingSafeEqual } from "node:crypto"
import { NextRequest } from "next/server"

import { readLegacyBlobVotes, upsertVotes } from "@/lib/votes"

/**
 * Migración única: copia a Supabase los votos guardados en Vercel Blob.
 * Los votos que ya existan en Supabase no se sobrescriben, así que se puede
 * ejecutar varias veces sin riesgo.
 *
 *   curl -X POST -H "Authorization: Bearer $MIGRATION_SECRET" \
 *     https://<dominio>/api/admin/migrar-votos
 */
export async function POST(request: NextRequest) {
  const secret = process.env.MIGRATION_SECRET
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "")
  if (
    !secret ||
    !given ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  ) {
    return new Response(null, { status: 401 })
  }

  const votes = await readLegacyBlobVotes()
  const rows = Object.entries(votes).flatMap(([poster, voters]) =>
    Object.entries(voters).map(([voter, rating]) => ({ poster, voter, rating }))
  )
  await upsertVotes(rows, { keepExisting: true })
  return Response.json({ migrated: rows.length })
}

import { NextRequest, NextResponse } from "next/server"

import { clearSession, isSameOrigin, readSession } from "@/lib/session"
import { MAX_VOTES, readVoterVotes, votingIsOpen } from "@/lib/votes"

const noStore = { "Cache-Control": "private, no-store" }

/** Quién está votando y qué pósters ha votado ya. */
export async function GET(request: NextRequest) {
  const session = readSession(request)
  return NextResponse.json(
    {
      email: session?.email ?? null,
      votes: session ? await readVoterVotes(session.id) : {},
      max: MAX_VOTES,
      open: votingIsOpen(),
    },
    { headers: noStore }
  )
}

/** Cerrar sesión. */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 })
  const response = new NextResponse(null, { status: 204, headers: noStore })
  clearSession(response)
  return response
}

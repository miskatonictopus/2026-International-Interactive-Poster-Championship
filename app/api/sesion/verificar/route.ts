import { NextRequest, NextResponse } from "next/server"

import {
  EmailLoginError,
  normalizeCode,
  normalizeEmail,
  verifyLoginCode,
} from "@/lib/email-login"
import { isSameOrigin, writeSession } from "@/lib/session"
import { MAX_VOTES, readVoterVotes, votingIsOpen } from "@/lib/votes"

/** Comprueba el código y abre la sesión de votante. */
export async function POST(request: NextRequest) {
  if (!votingIsOpen()) return new Response(null, { status: 423 })
  if (!isSameOrigin(request)) return new Response(null, { status: 403 })

  const body = await request.json().catch(() => null)
  const email = normalizeEmail(body?.email)
  const code = normalizeCode(body?.code)
  if (!email || !code) {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }

  try {
    const session = await verifyLoginCode(request, email, code)
    const response = NextResponse.json(
      {
        email: session.email,
        votes: await readVoterVotes(session.id),
        max: MAX_VOTES,
        open: true,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    )
    writeSession(request, response, session)
    return response
  } catch (error) {
    const reason = error instanceof EmailLoginError ? error.reason : "failed"
    const status =
      reason === "wrong-code" ? 401 : reason === "rate-limited" ? 429 : 502
    return NextResponse.json({ error: reason }, { status })
  }
}

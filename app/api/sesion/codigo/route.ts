import { NextRequest, NextResponse } from "next/server"

import {
  EmailLoginError,
  normalizeEmail,
  sendLoginCode,
} from "@/lib/email-login"
import { isSameOrigin } from "@/lib/session"
import { votingIsOpen } from "@/lib/votes"

/** Envía un código de acceso al correo indicado. */
export async function POST(request: NextRequest) {
  if (!votingIsOpen()) return new Response(null, { status: 423 })
  if (!isSameOrigin(request)) return new Response(null, { status: 403 })

  const body = await request.json().catch(() => null)
  const email = normalizeEmail(body?.email)
  if (!email) return NextResponse.json({ error: "invalid" }, { status: 400 })

  try {
    await sendLoginCode(request, email)
  } catch (error) {
    const reason = error instanceof EmailLoginError ? error.reason : "failed"
    const status =
      reason === "invalid" ? 400 : reason === "rate-limited" ? 429 : 502
    return NextResponse.json({ error: reason }, { status })
  }

  // Devolvemos el correo normalizado: es al que se ha enviado el código.
  return NextResponse.json({ email })
}

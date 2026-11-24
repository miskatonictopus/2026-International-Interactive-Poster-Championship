import { createHmac, timingSafeEqual } from "node:crypto"
import type { NextRequest, NextResponse } from "next/server"

/**
 * Sesión de votante: cookie httpOnly firmada (HMAC) con el id de usuario de
 * Supabase Auth y su correo. Se crea solo tras verificar el código enviado al
 * correo, así que abrir una ventana de incógnito no da votos nuevos: obliga a
 * volver a verificar el mismo correo, que conserva sus votos.
 */
export type VoterSession = { id: string; email: string }

const cookieName = "itaca-sesion"
const maxAge = 60 * 60 * 24 * 30 // 30 días

function secret() {
  const value =
    process.env.VOTE_SESSION_SECRET ?? process.env.SUPABASE_SECRET_KEY
  if (value) return value
  if (process.env.VERCEL === "1") {
    throw new Error("Configura VOTE_SESSION_SECRET o SUPABASE_SECRET_KEY")
  }
  return "solo-desarrollo-local"
}

function sign(payload: string) {
  // Clave derivada: la firma nunca usa la clave secreta tal cual.
  const key = createHmac("sha256", secret()).update("itaca-sesion").digest()
  return createHmac("sha256", key).update(payload).digest("base64url")
}

export function readSession(request: NextRequest): VoterSession | null {
  const value = request.cookies.get(cookieName)?.value
  if (!value) return null
  const [payload, signature] = value.split(".")
  if (!payload || !signature) return null

  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (
      typeof data.id !== "string" ||
      typeof data.email !== "string" ||
      typeof data.exp !== "number" ||
      data.exp < Date.now()
    ) {
      return null
    }
    return { id: data.id, email: data.email }
  } catch {
    return null
  }
}

export function writeSession(
  request: NextRequest,
  response: NextResponse,
  session: VoterSession
) {
  const payload = Buffer.from(
    JSON.stringify({ ...session, exp: Date.now() + maxAge * 1000 })
  ).toString("base64url")
  response.cookies.set(cookieName, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge,
    path: "/api",
  })
}

export function clearSession(response: NextResponse) {
  response.cookies.set(cookieName, "", { maxAge: 0, path: "/api" })
}

/** Las peticiones que cambian algo tienen que venir de la propia web. */
export function isSameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin
}

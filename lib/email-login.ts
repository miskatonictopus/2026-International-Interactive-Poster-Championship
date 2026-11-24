import { randomInt } from "node:crypto"
import type { NextRequest } from "next/server"

import { SupabaseError, supabase, supabaseFetch } from "@/lib/supabase"
import type { VoterSession } from "@/lib/session"

/**
 * Login sin contraseña: se envía un código de 6 dígitos al correo (Supabase
 * Auth, plantilla "Magic Link" con {{ .Token }}) y se verifica aquí.
 */

export type LoginError = "invalid" | "rate-limited" | "wrong-code" | "failed"

export class EmailLoginError extends Error {
  constructor(readonly reason: LoginError) {
    super(reason)
  }
}

/**
 * Correo canónico, para que los alias de una misma bandeja cuenten como una
 * sola persona: minúsculas, sin "+etiqueta" y, en Gmail, sin puntos.
 */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null
  const email = input.trim().toLowerCase()
  const match = /^([^\s@]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/.exec(email)
  if (!match || email.length > 254) return null

  let [, local, domain] = match
  local = local.split("+")[0]
  if (domain === "googlemail.com") domain = "gmail.com"
  if (domain === "gmail.com") local = local.replaceAll(".", "")
  if (!local) return null
  return `${local}@${domain}`
}

export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string") return null
  const code = input.replace(/\s/g, "")
  return /^\d{6,10}$/.test(code) ? code : null
}

/** IP del visitante, para que Supabase aplique sus límites por persona. */
function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    null
  )
}

function authHeaders(request: NextRequest) {
  const ip = clientIp(request)
  return ip ? { "Sb-Forwarded-For": ip } : undefined
}

function toLoginError(error: unknown): EmailLoginError {
  if (error instanceof SupabaseError) {
    if (error.status === 429) return new EmailLoginError("rate-limited")
    if (
      error.code === "otp_expired" ||
      error.code === "otp_disabled" ||
      error.status === 403
    ) {
      return new EmailLoginError("wrong-code")
    }
    if (
      error.code === "validation_failed" ||
      error.code === "email_address_invalid"
    ) {
      return new EmailLoginError("invalid")
    }
  }
  console.error(error)
  return new EmailLoginError("failed")
}

/* ---------- Modo local: el código se muestra en la consola del servidor ---------- */

type LocalCode = { code: string; expires: number; attempts: number }
const localCodes = ((
  globalThis as { __itacaCodes?: Map<string, LocalCode> }
).__itacaCodes ??= new Map<string, LocalCode>())

function localUserId(email: string) {
  // UUID estable a partir del correo (solo desarrollo)
  const hex = Buffer.from(email).toString("hex").padEnd(32, "0").slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/* ---------- API ---------- */

export async function sendLoginCode(request: NextRequest, email: string) {
  const db = supabase()
  if (!db) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
    localCodes.set(email, {
      code,
      expires: Date.now() + 10 * 60_000,
      attempts: 0,
    })
    console.info(`[votación local] Código para ${email}: ${code}`)
    return
  }

  try {
    await supabaseFetch(db, "auth/v1/otp", {
      method: "POST",
      headers: authHeaders(request),
      body: JSON.stringify({ email, create_user: true }),
    })
  } catch (error) {
    throw toLoginError(error)
  }
}

export async function verifyLoginCode(
  request: NextRequest,
  email: string,
  code: string
): Promise<VoterSession> {
  const db = supabase()
  if (!db) {
    const entry = localCodes.get(email)
    if (!entry || entry.expires < Date.now() || entry.attempts >= 5) {
      throw new EmailLoginError("wrong-code")
    }
    entry.attempts++
    if (entry.code !== code) throw new EmailLoginError("wrong-code")
    localCodes.delete(email)
    return { id: localUserId(email), email }
  }

  try {
    const response = await supabaseFetch(db, "auth/v1/verify", {
      method: "POST",
      headers: authHeaders(request),
      body: JSON.stringify({ type: "email", email, token: code }),
    })
    const { user } = await response.json()
    if (!user?.id) throw new EmailLoginError("failed")
    return { id: user.id, email: user.email ?? email }
  } catch (error) {
    if (error instanceof EmailLoginError) throw error
    throw toLoginError(error)
  }
}

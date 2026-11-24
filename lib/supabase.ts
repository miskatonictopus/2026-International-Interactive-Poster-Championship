/**
 * Acceso a Supabase desde el servidor con la clave secreta.
 * Sin SUPABASE_URL / SUPABASE_SECRET_KEY (desarrollo) devuelve null y se usa
 * el modo local. VOTES_STORAGE=local fuerza el modo local aunque haya claves,
 * para probar sin tocar la base de datos ni enviar correos reales.
 */
export type SupabaseConfig = { url: string; key: string }

export class SupabaseError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(`Supabase respondió ${status}: ${body}`)
  }

  /** Código de error de Supabase (`code` o `error_code`), si lo hay. */
  get code(): string | undefined {
    try {
      const parsed = JSON.parse(this.body)
      return parsed.code ?? parsed.error_code
    } catch {
      return undefined
    }
  }
}

export function supabase(): SupabaseConfig | null {
  if (process.env.VOTES_STORAGE === "local" && process.env.VERCEL !== "1") {
    return null
  }
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (url && key) return { url: url.replace(/\/$/, ""), key }
  if (process.env.VERCEL === "1") {
    throw new Error(
      "Configura SUPABASE_URL y SUPABASE_SECRET_KEY para guardar los votos"
    )
  }
  return null
}

/** Petición a Supabase; `path` incluye el servicio (`rest/v1/…`, `auth/v1/…`). */
export async function supabaseFetch(
  { url, key }: SupabaseConfig,
  path: string,
  init: RequestInit = {}
) {
  const headers = new Headers(init.headers)
  headers.set("apikey", key)
  // Las claves antiguas (service_role) son JWT y van también como Bearer.
  if (!key.startsWith("sb_")) headers.set("Authorization", `Bearer ${key}`)
  if (init.body) headers.set("Content-Type", "application/json")

  const response = await fetch(`${url}/${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) {
    throw new SupabaseError(response.status, await response.text())
  }
  return response
}

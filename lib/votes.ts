import { get } from "@vercel/blob"
import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export type Votes = Record<string, Record<string, number>>
export type Totals = { total: number; points: number }

const voteFile =
  process.env.VOTES_FILE ?? join(process.cwd(), ".data", "votes.json")
let localWrites = Promise.resolve()

/**
 * Solo se vota en producción. En local o en las previews se puede forzar con
 * VOTING_OPEN=1 para hacer pruebas.
 */
export function votingIsOpen() {
  return (
    process.env.VERCEL_ENV === "production" || process.env.VOTING_OPEN === "1"
  )
}

/* ---------- Supabase (producción) ---------- */

function supabase() {
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

async function rest(
  { url, key }: { url: string; key: string },
  path: string,
  init: RequestInit = {}
) {
  const headers = new Headers(init.headers)
  headers.set("apikey", key)
  // Las claves antiguas (service_role) son JWT y van también como Bearer.
  if (!key.startsWith("sb_")) headers.set("Authorization", `Bearer ${key}`)
  if (init.body) headers.set("Content-Type", "application/json")

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) {
    throw new Error(
      `Supabase respondió ${response.status}: ${await response.text()}`
    )
  }
  return response
}

async function supabaseTotals(db: { url: string; key: string }) {
  const rows: { poster: string; total: number; points: number }[] = await (
    await rest(db, "rpc/vote_totals", { method: "POST", body: "{}" })
  ).json()
  return Object.fromEntries(
    rows.map(({ poster, total, points }) => [
      poster,
      { total: Number(total), points: Number(points) },
    ])
  )
}

/** Inserta votos; con `keepExisting` no sobrescribe los que ya existan. */
export async function upsertVotes(
  rows: { poster: string; voter: string; rating: number }[],
  { keepExisting = false } = {}
) {
  const db = supabase()
  if (!db) throw new Error("Supabase no está configurado")
  if (rows.length === 0) return
  await rest(db, "votes?on_conflict=poster,voter", {
    method: "POST",
    headers: {
      Prefer: `resolution=${keepExisting ? "ignore" : "merge"}-duplicates,return=minimal`,
    },
    body: JSON.stringify(
      rows.map((row) => ({ ...row, updated_at: new Date().toISOString() }))
    ),
  })
}

/* ---------- Archivo local (desarrollo sin Supabase) ---------- */

async function readLocalVotes(): Promise<Votes> {
  try {
    return JSON.parse(
      await readFile(/* turbopackIgnore: true */ voteFile, "utf8")
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw error
  }
}

function localTotals(votes: Votes, poster: string): Totals {
  const ratings = Object.values(votes[poster] ?? {})
  return {
    total: ratings.length,
    points: ratings.reduce((total, rating) => total + rating, 0),
  }
}

/* ---------- API común ---------- */

/** Totales de todos los pósters que tienen votos. */
export async function readTotals(): Promise<Record<string, Totals>> {
  const db = supabase()
  if (db) return supabaseTotals(db)
  const votes = await readLocalVotes()
  return Object.fromEntries(
    Object.keys(votes).map((poster) => [poster, localTotals(votes, poster)])
  )
}

/** Totales de un póster y el voto de este votante. */
export async function readSummary(poster: string, voter: string) {
  const db = supabase()
  if (!db) {
    const votes = await readLocalVotes()
    return {
      ...localTotals(votes, poster),
      rating: votes[poster]?.[voter] ?? null,
    }
  }

  const [totals, mine] = await Promise.all([
    supabaseTotals(db),
    rest(
      db,
      `votes?select=rating&poster=eq.${encodeURIComponent(poster)}&voter=eq.${encodeURIComponent(voter)}`
    ).then((response) => response.json() as Promise<{ rating: number }[]>),
  ])
  return {
    ...(totals[poster] ?? { total: 0, points: 0 }),
    rating: mine[0]?.rating ?? null,
  }
}

export async function saveVote(poster: string, voter: string, rating: number) {
  if (supabase()) {
    await upsertVotes([{ poster, voter, rating }])
    return readSummary(poster, voter)
  }

  const write = localWrites.then(async () => {
    const votes = await readLocalVotes()
    votes[poster] ??= {}
    votes[poster][voter] = rating

    await mkdir(dirname(voteFile), { recursive: true })
    const temporaryFile = `${voteFile}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryFile, JSON.stringify(votes, null, 2), {
        mode: 0o600,
      })
      await rename(temporaryFile, voteFile)
    } finally {
      await rm(temporaryFile, { force: true })
    }
  })
  localWrites = write.then(
    () => undefined,
    () => undefined
  )
  await write
  return readSummary(poster, voter)
}

/* ---------- Migración desde Vercel Blob ---------- */

/** Lee los votos antiguos guardados en Vercel Blob (solo para migrarlos). */
export async function readLegacyBlobVotes(): Promise<Votes> {
  const result = await get("itaca/votes.json", {
    access: "private",
    useCache: false,
    abortSignal: AbortSignal.timeout(8000),
  })
  if (!result) return {}
  if (result.statusCode !== 200) {
    throw new Error("No se pudieron leer los votos de Vercel Blob")
  }
  return new Response(result.stream).json()
}

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import { SupabaseError, supabase, supabaseFetch } from "@/lib/supabase"

export type Votes = Record<string, Record<string, number>>
export type Totals = { total: number; points: number }

/** Carteles distintos que puede puntuar cada persona. */
export const MAX_VOTES = 3

/** Se lanza al intentar puntuar un cartel nuevo con el cupo ya agotado. */
export class VoteLimitError extends Error {
  constructor() {
    super(`Solo se pueden votar ${MAX_VOTES} carteles`)
  }
}

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

type Db = NonNullable<ReturnType<typeof supabase>>

async function supabaseTotals(db: Db) {
  const rows: { poster: string; total: number; points: number }[] = await (
    await supabaseFetch(db, "rest/v1/rpc/vote_totals", {
      method: "POST",
      body: "{}",
    })
  ).json()
  return Object.fromEntries(
    rows.map(({ poster, total, points }) => [
      poster,
      { total: Number(total), points: Number(points) },
    ])
  )
}

async function supabaseVoterVotes(db: Db, voter: string) {
  const rows: { poster: string; rating: number }[] = await (
    await supabaseFetch(
      db,
      `rest/v1/votes?select=poster,rating&voter=eq.${encodeURIComponent(voter)}`
    )
  ).json()
  return Object.fromEntries(rows.map(({ poster, rating }) => [poster, rating]))
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

function localVoterVotes(votes: Votes, voter: string) {
  return Object.fromEntries(
    Object.entries(votes).flatMap(([poster, voters]) =>
      voter in voters ? [[poster, voters[voter]]] : []
    )
  )
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

/** Notas que ha puesto un votante, por póster. */
export async function readVoterVotes(
  voter: string
): Promise<Record<string, number>> {
  const db = supabase()
  if (db) return supabaseVoterVotes(db, voter)
  return localVoterVotes(await readLocalVotes(), voter)
}

/** Totales de un póster y, si hay votante, su nota. */
export async function readSummary(poster: string, voter: string | null) {
  const db = supabase()
  if (!db) {
    const votes = await readLocalVotes()
    return {
      ...localTotals(votes, poster),
      rating: (voter && votes[poster]?.[voter]) || null,
    }
  }

  const [totals, mine] = await Promise.all([
    supabaseTotals(db),
    voter ? supabaseVoterVotes(db, voter) : {},
  ])
  return {
    ...(totals[poster] ?? { total: 0, points: 0 }),
    rating: (mine as Record<string, number>)[poster] ?? null,
  }
}

/**
 * Guarda o cambia la nota de un votante. Se puede cambiar la nota de un póster
 * ya votado, pero no votar más de MAX_VOTES pósters distintos: en Supabase lo
 * impide el trigger `votes_limit` (a prueba de peticiones simultáneas).
 */
export async function saveVote(poster: string, voter: string, rating: number) {
  const db = supabase()
  if (db) {
    try {
      await supabaseFetch(db, "rest/v1/votes?on_conflict=poster,voter", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          poster,
          voter,
          rating,
          updated_at: new Date().toISOString(),
        }),
      })
    } catch (error) {
      if (
        error instanceof SupabaseError &&
        error.body.includes("vote_limit_reached")
      ) {
        throw new VoteLimitError()
      }
      throw error
    }
    return readSummary(poster, voter)
  }

  const write = localWrites.then(async () => {
    const votes = await readLocalVotes()
    const mine = localVoterVotes(votes, voter)
    if (!(poster in mine) && Object.keys(mine).length >= MAX_VOTES) {
      throw new VoteLimitError()
    }
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

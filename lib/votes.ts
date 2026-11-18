import { BlobPreconditionFailedError, get, put } from "@vercel/blob"
import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

export type Votes = Record<string, Record<string, number>>

const voteFile =
  process.env.VOTES_FILE ?? join(process.cwd(), ".data", "votes.json")
const blobPath =
  process.env.VERCEL_ENV === "preview"
    ? "itaca/preview-votes.json"
    : "itaca/votes.json"
let localWrites = Promise.resolve()

function blobIsConfigured() {
  if (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN)
    return true
  if (process.env.VERCEL === "1") {
    throw new Error(
      "Conecta un almacén privado de Vercel Blob para guardar los votos"
    )
  }
  return false
}

async function readLocalVotes(): Promise<Votes> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ voteFile, "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw error
  }
}

async function readBlobVotes(): Promise<{ votes: Votes; etag?: string }> {
  const result = await get(blobPath, {
    access: "private",
    useCache: false,
    abortSignal: AbortSignal.timeout(8000),
  })
  if (!result) return { votes: {} }
  if (result.statusCode !== 200 || !result.blob.etag) {
    throw new Error(
      "La lectura de votos en Vercel Blob no devolvió una versión válida"
    )
  }
  return {
    votes: await new Response(result.stream).json(),
    etag: result.blob.etag,
  }
}

export async function readVotes() {
  return blobIsConfigured() ? (await readBlobVotes()).votes : readLocalVotes()
}

export function voteTotals(votes: Votes, poster: string) {
  const ratings = Object.values(votes[poster] ?? {})
  return {
    total: ratings.length,
    points: ratings.reduce((total, rating) => total + rating, 0),
  }
}

function applyVote(
  votes: Votes,
  poster: string,
  voter: string,
  rating: number
) {
  votes[poster] ??= {}
  votes[poster][voter] = rating
}

async function saveBlobVote(poster: string, voter: string, rating: number) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { votes, etag } = await readBlobVotes()
    if (votes[poster]?.[voter] === rating) return votes
    applyVote(votes, poster, voter, rating)

    try {
      await put(blobPath, JSON.stringify(votes), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
      })
      return votes
    } catch (error) {
      // When two requests create the first blob, the second can fail before an ETag exists.
      if (!(error instanceof BlobPreconditionFailedError)) {
        if (etag || !(await readBlobVotes()).etag) throw error
      }
      await delay(Math.random() * Math.min(25 * 2 ** attempt, 250))
    }
  }
  throw new Error("Hay demasiados votos simultáneos. Vuelve a enviar el voto")
}

export async function saveVote(poster: string, voter: string, rating: number) {
  if (blobIsConfigured()) return saveBlobVote(poster, voter, rating)

  const write = localWrites.then(async () => {
    const votes = await readLocalVotes()
    applyVote(votes, poster, voter, rating)

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
    return votes
  })
  localWrites = write.then(
    () => undefined,
    () => undefined
  )
  return write
}

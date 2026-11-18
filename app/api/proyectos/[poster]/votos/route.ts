import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { NextRequest, NextResponse } from "next/server"

import { posters } from "@/lib/posters"

type Votes = Record<string, Record<string, number>>
type Context = { params: Promise<{ poster: string }> }

const voteFile =
  process.env.VOTES_FILE ?? join(process.cwd(), ".data", "votes.json")
const voterCookie = "itaca-voter"
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
let writes = Promise.resolve()

async function readVotes(): Promise<Votes> {
  try {
    return JSON.parse(await readFile(voteFile, "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw error
  }
}

function getVoter(request: NextRequest) {
  const value = request.cookies.get(voterCookie)?.value
  return value && uuid.test(value) ? value : null
}

function summary(votes: Votes, poster: string, voter: string) {
  const ratings = votes[poster] ?? {}
  const values = Object.values(ratings)
  return NextResponse.json(
    {
      total: values.length,
      points: values.reduce((total, rating) => total + rating, 0),
      rating: ratings[voter] ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}

export async function GET(request: NextRequest, { params }: Context) {
  const { poster } = await params
  if (!posters.some(({ id }) => id === poster)) {
    return new Response(null, { status: 404 })
  }

  const previousVoter = getVoter(request)
  const voter = previousVoter ?? randomUUID()
  const response = summary(await readVotes(), poster, voter)

  if (!previousVoter) {
    response.cookies.set(voterCookie, voter, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 365,
      path: `/api/proyectos/${poster}/votos`,
    })
  }

  return response
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { poster } = await params
  if (!posters.some(({ id }) => id === poster)) {
    return new Response(null, { status: 404 })
  }

  const voter = getVoter(request)
  if (!voter) return new Response(null, { status: 409 })
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return new Response(null, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const rating: unknown = body?.rating
  if (
    typeof rating !== "number" ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return new Response(null, { status: 400 })
  }

  const write = writes.then(async () => {
    const votes = await readVotes()
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

    return summary(votes, poster, voter)
  })
  writes = write.then(
    () => undefined,
    () => undefined
  )
  return write
}

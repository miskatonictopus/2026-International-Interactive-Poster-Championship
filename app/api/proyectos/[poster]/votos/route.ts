import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

import { posters } from "@/lib/posters"
import {
  readVotes,
  saveVote,
  type Votes,
  voteTotals,
  votingIsOpen,
} from "@/lib/votes"

type Context = { params: Promise<{ poster: string }> }

const voterCookie = "itaca-voter"
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/

function getVoter(request: NextRequest) {
  const value = request.cookies.get(voterCookie)?.value
  return value && uuid.test(value) ? value : null
}

function summary(votes: Votes, poster: string, voter: string) {
  return NextResponse.json(
    {
      ...voteTotals(votes, poster),
      rating: votes[poster]?.[voter] ?? null,
      open: votingIsOpen(),
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

  if (!votingIsOpen()) return new Response(null, { status: 423 })

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

  return summary(await saveVote(poster, voter, rating), poster, voter)
}

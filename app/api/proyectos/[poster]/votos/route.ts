import { NextRequest, NextResponse } from "next/server"

import { posters } from "@/lib/posters"
import { isSameOrigin, readSession } from "@/lib/session"
import {
  readSummary,
  saveVote,
  VoteLimitError,
  votingIsOpen,
} from "@/lib/votes"

type Context = { params: Promise<{ poster: string }> }

const noStore = { "Cache-Control": "private, no-store" }

function summary(data: Awaited<ReturnType<typeof readSummary>>) {
  return NextResponse.json(
    { ...data, open: votingIsOpen() },
    { headers: noStore }
  )
}

export async function GET(request: NextRequest, { params }: Context) {
  const { poster } = await params
  if (!posters.some(({ id }) => id === poster)) {
    return new Response(null, { status: 404 })
  }
  const session = readSession(request)
  return summary(await readSummary(poster, session?.id ?? null))
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { poster } = await params
  if (!posters.some(({ id }) => id === poster)) {
    return new Response(null, { status: 404 })
  }

  if (!votingIsOpen()) return new Response(null, { status: 423 })
  if (!isSameOrigin(request)) return new Response(null, { status: 403 })

  // Solo se vota con el correo verificado.
  const session = readSession(request)
  if (!session) return new Response(null, { status: 401 })

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

  try {
    return summary(await saveVote(poster, session.id, rating))
  } catch (error) {
    if (error instanceof VoteLimitError) {
      return NextResponse.json(
        { error: "limit" },
        { status: 409, headers: noStore }
      )
    }
    throw error
  }
}

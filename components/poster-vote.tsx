"use client"

import { type FormEvent, useContext, useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import { LiveVoteTotals } from "./live-vote-totals"

type VoteSummary = {
  total: number
  points: number
  rating: number | null
  open: boolean
}

const pointsFormat = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 2,
})

export function PosterVote({
  poster,
  author,
  number,
}: {
  poster: string
  author: string
  number: number
}) {
  const endpoint = `/api/proyectos/${encodeURIComponent(poster)}/votos`
  const [summary, setSummary] = useState<VoteSummary | null>(null)
  const liveTotals = useContext(LiveVoteTotals)[poster] ?? summary
  const [draftRating, setDraftRating] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch(endpoint, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("No se pudieron cargar los votos")
        return response.json()
      })
      .then(setSummary)
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [endpoint, retry])

  const selected = draftRating ?? summary?.rating ?? 0
  const closed = summary !== null && !summary.open
  const canSubmit =
    summary !== null &&
    summary.open &&
    selected > 0 &&
    selected !== summary.rating &&
    !saving

  async function submitVote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setSaving(true)
    setError(false)
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: selected }),
      })
      if (response.status === 409) setSummary(null)
      if (response.status === 423)
        setSummary((loaded) => loaded && { ...loaded, open: false })
      if (!response.ok) throw new Error("No se pudo guardar el voto")
      const { rating }: VoteSummary = await response.json()
      setSummary((loaded) => loaded && { ...loaded, rating })
      setSubmitted(true)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  const highlighted = hover ?? selected
  const points = liveTotals?.points

  return (
    <form onSubmit={submitVote}>
      <div className="flex items-stretch justify-between gap-[2.5cqw] leading-none">
        <div className="flex flex-col justify-between">
          <span className="text-[length:12cqw] leading-[0.8] font-black tracking-[-0.06em] tabular-nums">
            {String(number).padStart(2, "0")}
          </span>
          <span className="mt-[2.5cqw] text-[length:2.8cqw] uppercase">
            Poster
          </span>
        </div>
        <div className="flex flex-col items-center justify-between">
          <div
            role="group"
            aria-label={`Valorar el póster de ${author}`}
            className="flex gap-[0.6cqw]"
            onPointerLeave={() => setHover(null)}
          >
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                aria-label={rating === 1 ? "1 punto" : `${rating} puntos`}
                aria-pressed={rating === selected}
                disabled={!summary || closed}
                aria-disabled={saving || undefined}
                className="flex w-[6cqw] flex-col items-center gap-[0.6cqw] rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-950 enabled:cursor-pointer"
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch") setHover(rating)
                }}
                onClick={() => {
                  if (saving) return
                  setDraftRating(rating)
                  setSubmitted(false)
                  setError(false)
                }}
              >
                <span
                  aria-hidden="true"
                  className="text-[length:2.5cqw] font-bold"
                >
                  {rating}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-[4.9cqw] rounded-full border border-[#262626]",
                    rating <= highlighted ? "bg-[#0a0a0a]" : "bg-transparent"
                  )}
                />
              </button>
            ))}
          </div>
          <span className="mt-[2.5cqw] text-[length:2.8cqw] whitespace-nowrap uppercase">
            Vota por este poster!
          </span>
        </div>
        <div className="flex flex-col items-end justify-between">
          <button
            type="submit"
            disabled={!canSubmit}
            className="h-[9cqw] w-full min-w-[26cqw] rounded-[1.8cqw] bg-[#0a0a0a] px-[2cqw] text-[length:2.8cqw] font-semibold text-white uppercase focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-950 enabled:cursor-pointer disabled:opacity-45"
          >
            {saving ? "Enviando…" : "Enviar"}
          </button>
          <span
            role="status"
            className="mt-[2.5cqw] text-[length:2.8cqw] whitespace-nowrap uppercase"
          >
            Total puntos:{" "}
            <strong className="tabular-nums">
              {points === undefined
                ? "—"
                : points % 1 === 0
                  ? String(points).padStart(5, "0")
                  : pointsFormat.format(points)}
            </strong>
          </span>
        </div>
      </div>
      {closed && (
        <p className="mt-1 text-right text-[length:2.8cqw] text-neutral-500">
          La votación solo está abierta en la web oficial.
        </p>
      )}
      <p
        role="status"
        className={
          submitted
            ? "mt-1 text-right font-bold tracking-[-0.02em] text-red-500"
            : "sr-only"
        }
      >
        {submitted ? "Voto guardado." : ""}
      </p>
      {error && (
        <p role="alert" className="mt-1 text-red-700">
          {summary
            ? "No se pudo guardar el voto. Pulsa «Enviar voto» para reintentar."
            : "No se pudieron cargar los votos."}
          {!summary && (
            <button
              type="button"
              className="ml-1 underline"
              onClick={() => {
                setError(false)
                setRetry(retry + 1)
              }}
            >
              Reintentar
            </button>
          )}
        </p>
      )}
    </form>
  )
}

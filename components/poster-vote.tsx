"use client"

import { type FormEvent, useContext, useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import { LiveVoteTotals } from "./live-vote-totals"

type VoteSummary = { total: number; points: number; rating: number | null }

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
  const canSubmit =
    summary !== null && selected > 0 && selected !== summary.rating && !saving

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
      <div className="flex items-stretch justify-between gap-2 leading-none">
        <div className="flex flex-col justify-between">
          <span className="text-[2.5rem] leading-[0.8] font-black tracking-[-0.06em] tabular-nums">
            {String(number).padStart(2, "0")}
          </span>
          <span className="mt-2 text-[11px] uppercase">Poster</span>
        </div>
        <div className="flex flex-col items-center justify-between">
          <div
            role="group"
            aria-label={`Valorar el póster de ${author}`}
            className="flex gap-0.5"
            onPointerLeave={() => setHover(null)}
          >
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                aria-label={rating === 1 ? "1 punto" : `${rating} puntos`}
                aria-pressed={rating === selected}
                disabled={!summary}
                aria-disabled={saving || undefined}
                className="flex w-5 flex-col items-center gap-0.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-950 enabled:cursor-pointer"
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
                <span aria-hidden="true" className="text-[8px] font-bold">
                  {rating}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-4 rounded-full border border-[#262626]",
                    rating <= highlighted ? "bg-[#0a0a0a]" : "bg-transparent"
                  )}
                />
              </button>
            ))}
          </div>
          <span className="mt-2 text-[11px] whitespace-nowrap uppercase">
            Vota por este poster!
          </span>
        </div>
        <div className="flex flex-col items-end justify-between">
          <button
            type="submit"
            disabled={!canSubmit}
            className="h-[30px] w-full min-w-20 rounded-md bg-[#0a0a0a] px-2 text-[11px] font-semibold text-white uppercase focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-950 enabled:cursor-pointer disabled:opacity-45"
          >
            {saving ? "Enviando…" : "Enviar"}
          </button>
          <span
            role="status"
            className="mt-2 text-[11px] whitespace-nowrap uppercase"
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

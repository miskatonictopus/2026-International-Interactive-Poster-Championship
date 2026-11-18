"use client"

import { type FormEvent, useEffect, useState } from "react"

import { cn } from "@/lib/utils"

type VoteSummary = { total: number; points: number; rating: number | null }

const pointsFormat = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 2,
})
const votesFormat = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 })

export function PosterVote({
  poster,
  author,
}: {
  poster: string
  author: string
}) {
  const endpoint = `/api/proyectos/${encodeURIComponent(poster)}/votos`
  const [summary, setSummary] = useState<VoteSummary | null>(null)
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
      // Los contadores reflejan la última carga de la página.
      setSummary((loaded) => loaded && { ...loaded, rating })
      setSubmitted(true)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  const highlighted = hover ?? selected
  const totals = [
    {
      value: summary?.points,
      format: pointsFormat,
      singular: "punto",
      plural: "puntos",
    },
    {
      value: summary?.total,
      format: votesFormat,
      singular: "voto",
      plural: "votos",
    },
  ]

  return (
    <form className="mt-2" onSubmit={submitVote}>
      <div className="flex flex-wrap items-start gap-x-0.5 gap-y-1">
        <div>
          <div
            role="group"
            aria-label={`Valorar el póster de ${author}`}
            className="flex"
            onPointerLeave={() => setHover(null)}
          >
            <span className="mr-1 flex h-7 shrink-0 items-center text-[11px] font-bold">
              VOTA!
            </span>
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                aria-label={rating === 1 ? "1 punto" : `${rating} puntos`}
                aria-pressed={rating === selected}
                disabled={!summary}
                aria-disabled={saving || undefined}
                className="grid h-7 w-6 place-items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-950 enabled:cursor-pointer"
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
                  className={cn(
                    "size-[18px] rounded-full border border-[#262626]",
                    rating <= highlighted
                      ? "bg-red-600 shadow-[inset_2px_2px_4px_#26262655,inset_-1px_-1px_3px_#ffffff65]"
                      : "bg-[#f5f5f5] shadow-[2px_2px_4px_#26262636,-2px_-2px_4px_#ffffff]"
                  )}
                />
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-1 rounded-sm bg-[#0a0a0a] px-3 py-1.5 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-950 enabled:cursor-pointer disabled:opacity-45"
          >
            {saving ? "Enviando…" : "Enviar voto"}
          </button>
        </div>
        <div role="status" className="ml-auto flex gap-0.5 text-center">
          {totals.map(({ value, format, singular, plural }) => (
            <div key={plural} className="flex flex-col items-center gap-0.5">
              <span className="grid aspect-square w-max min-w-7 place-items-center rounded-full bg-[#0a0a0a] px-1 font-sans text-base leading-none font-bold whitespace-nowrap text-white tabular-nums">
                {value === undefined ? "—" : format.format(value)}
              </span>
              <span className="text-[10px] leading-tight text-neutral-700">
                {value === 1 ? singular : plural}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p
        role="status"
        className={submitted ? "mt-1 text-neutral-700" : "sr-only"}
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

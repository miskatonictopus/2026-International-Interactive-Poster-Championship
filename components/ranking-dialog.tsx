"use client"

import { Dialog } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

type Totals = Record<string, { points: number; total: number }>

const pointsFormat = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 2,
})

export function RankingDialog({
  posters,
}: {
  posters: { id: string; author: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [totals, setTotals] = useState<Totals | null>(null)
  const [error, setError] = useState(false)

  // Mientras el diálogo está abierto, pedimos los totales y los refrescamos.
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()

    async function refresh() {
      try {
        const response = await fetch("/api/votos", {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("No se pudo cargar el ranking")
        const values: Totals = await response.json()
        if (!controller.signal.aborted) {
          setTotals(values)
          setError(false)
        }
      } catch {
        if (!controller.signal.aborted) setError(true)
      }
    }

    refresh()
    const timer = window.setInterval(refresh, 5000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [open])

  // Orden por puntos y, a igualdad, por número de votos. Los empates
  // comparten posición (1, 1, 3…).
  const rows = posters
    .map(({ id, author }, index) => ({
      id,
      author,
      number: index + 1,
      points: totals?.[id]?.points ?? 0,
      votes: totals?.[id]?.total ?? 0,
    }))
    .sort((a, b) => b.points - a.points || b.votes - a.votes)
  const ranked = rows.map((row, index) => {
    const first = rows.findIndex(
      (other) => other.points === row.points && other.votes === row.votes
    )
    return { ...row, position: first === -1 ? index + 1 : first + 1 }
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="h-10 cursor-pointer rounded-lg bg-[#0a0a0a] px-5 text-sm font-semibold text-white uppercase transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">
        Ver ranking
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-neutral-950/40 backdrop-blur-md transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
        <Dialog.Viewport className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
          <Dialog.Popup className="relative my-auto w-full max-w-xl bg-[#f5f5f5] p-6 text-neutral-950 shadow-2xl transition-[scale,opacity] duration-200 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0 sm:p-8">
            <Dialog.Title className="text-[length:clamp(2rem,8vw,3rem)] leading-[0.85] font-black tracking-[-0.06em]">
              <span className="text-red-600">Ranking</span> de carteles
            </Dialog.Title>
            <Dialog.Description className="mt-3 font-light tracking-[-0.03em]">
              Posiciones según los puntos recibidos. Se actualiza en directo.
            </Dialog.Description>
            <hr className="mt-5 border-t border-[#0a0a0a]" />

            {error && !totals ? (
              <p role="alert" className="py-8 text-center text-red-700">
                No se pudo cargar el ranking.
              </p>
            ) : !totals ? (
              <p role="status" className="py-8 text-center text-neutral-500">
                Cargando ranking…
              </p>
            ) : (
              <ol
                aria-label="Posiciones"
                className="divide-y divide-neutral-300"
              >
                {ranked.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-4 py-3 leading-none"
                  >
                    <span
                      className={cn(
                        "w-14 shrink-0 text-4xl font-black tracking-[-0.06em] tabular-nums",
                        row.position <= 3 && row.points > 0 && "text-red-600"
                      )}
                    >
                      {String(row.position).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">
                        {row.author}
                      </span>
                      <span className="mt-1 block text-xs text-neutral-600 uppercase">
                        Poster {String(row.number).padStart(2, "0")} ·{" "}
                        {row.votes === 1 ? "1 voto" : `${row.votes} votos`}
                      </span>
                    </span>
                    <span className="text-right">
                      <strong className="block text-2xl font-black tracking-[-0.04em] tabular-nums">
                        {pointsFormat.format(row.points)}
                      </strong>
                      <span className="mt-1 block text-xs text-neutral-600 uppercase">
                        Puntos
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <Dialog.Close
              aria-label="Cerrar"
              className="absolute -top-3 -right-3 flex size-9 cursor-pointer items-center justify-center rounded-full bg-white text-neutral-950 shadow-md transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
            >
              <XIcon aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

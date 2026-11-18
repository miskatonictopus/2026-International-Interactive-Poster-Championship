"use client"

import { createContext, type ReactNode, useEffect, useState } from "react"

type Totals = Record<string, { points: number; total: number }>

export const LiveVoteTotals = createContext<Totals>({})

export function LiveVoteTotalsProvider({ children }: { children: ReactNode }) {
  const [totals, setTotals] = useState<Totals>({})

  useEffect(() => {
    const controller = new AbortController()
    let pending = false

    async function refresh() {
      if (document.visibilityState !== "visible" || pending) return
      pending = true
      try {
        const response = await fetch("/api/votos", {
          signal: controller.signal,
        })
        if (!response.ok) return
        const values: Totals = await response.json()
        if (!controller.signal.aborted) setTotals(values)
      } catch {
        // Keep the last totals if a periodic refresh fails.
      } finally {
        pending = false
      }
    }

    const timer = window.setInterval(refresh, 5000)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [])

  return (
    <LiveVoteTotals.Provider value={totals}>{children}</LiveVoteTotals.Provider>
  )
}

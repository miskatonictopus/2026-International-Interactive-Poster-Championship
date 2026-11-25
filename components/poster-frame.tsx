"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/** Margen alrededor de la pantalla en el que un póster ya se considera visible. */
const NEAR_VIEWPORT = "150px 0px"
/** Espera antes de descargar un póster que ha salido de la pantalla. */
const UNLOAD_DELAY_MS = 1500

/**
 * Iframe de un póster.
 *
 * Cada póster es una página animada (muchos con WebGL y física), así que solo
 * se mantiene cargado mientras está cerca de la pantalla: al salir se descarga
 * para liberar CPU, GPU y su contexto WebGL. Con `active={false}` se descarga
 * siempre (p. ej. mientras el mismo póster está ampliado en un diálogo).
 *
 * El iframe permanece oculto (y sin interacción) hasta que su documento ha
 * terminado de cargar todos los scripts, modelos e imágenes.
 */
export function PosterFrame({
  src,
  title,
  active = true,
}: {
  src: string
  title: string
  active?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const shouldRun = active && nearViewport

  // ¿Está el póster en pantalla (o a punto de entrar)?
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let unloadTimer: number | undefined

    const observer = new IntersectionObserver(
      ([entry]) => {
        window.clearTimeout(unloadTimer)
        if (entry.isIntersecting) {
          setNearViewport(true)
        } else {
          // Con un pequeño retraso, para no recargar al hacer scroll rápido.
          unloadTimer = window.setTimeout(
            () => setNearViewport(false),
            UNLOAD_DELAY_MS
          )
        }
      },
      { rootMargin: NEAR_VIEWPORT }
    )
    observer.observe(container)
    return () => {
      window.clearTimeout(unloadTimer)
      observer.disconnect()
    }
  }, [])

  // Cargar o descargar el documento del póster. Asignamos el src tras hidratar:
  // así el evento load nunca llega antes de que React tenga enganchado onLoad.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    if (shouldRun) {
      if (frame.getAttribute("src") !== src) frame.src = src
    } else if (frame.hasAttribute("src")) {
      // Quitar el src detiene sus scripts y animaciones y libera el WebGL.
      frame.removeAttribute("src")
      frame.contentWindow?.location.replace("about:blank")
      setLoaded(false)
    }
  }, [shouldRun, src])

  return (
    <div
      ref={containerRef}
      className="relative aspect-[848/1200] w-full bg-[#fafafa]"
    >
      <iframe
        ref={frameRef}
        title={title}
        onLoad={(event) => {
          if (event.currentTarget.getAttribute("src")) setLoaded(true)
        }}
        inert={!loaded}
        aria-busy={!loaded}
        className={cn(
          "block h-full w-full border-0 transition-opacity duration-500",
          loaded ? "opacity-100" : "opacity-0"
        )}
      />
      {!loaded && shouldRun && (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm font-light tracking-[-0.03em] text-neutral-500"
        >
          <span
            aria-hidden="true"
            className="size-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900"
          />
          Cargando cartel…
        </div>
      )}
    </div>
  )
}

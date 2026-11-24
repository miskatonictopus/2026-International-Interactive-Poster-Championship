"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Iframe de un póster que permanece oculto (y sin interacción) hasta que su
 * documento ha terminado de cargar todos los scripts, modelos e imágenes.
 */
export function PosterFrame({ src, title }: { src: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)

  // Asignamos el src tras hidratar: así el evento load nunca llega antes de
  // que React tenga enganchado onLoad, y la página carga antes que los pósters.
  useEffect(() => {
    const frame = frameRef.current
    if (frame && frame.getAttribute("src") !== src) frame.src = src
  }, [src])

  return (
    <div className="relative aspect-[848/1200] w-full bg-[#fafafa]">
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
      {!loaded && (
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

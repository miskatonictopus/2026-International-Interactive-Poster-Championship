"use client"

import { Dialog } from "@base-ui/react/dialog"
import { PlayIcon, XIcon, ZoomInIcon } from "lucide-react"
import Image from "next/image"
import { useState } from "react"

import { PosterFrame } from "./poster-frame"
import { PosterVote } from "./poster-vote"

/*
 * Alto aproximado del contenido respecto a su ancho: póster (1200/848) más la
 * fila de votación (~0,17). Con esto el diálogo ocupa el 100 % del alto.
 */
const DIALOG_WIDTH =
  "min(calc(100vw - 2rem), calc((100dvh - 8rem) / 1.6 + 2rem))"

export function PosterCard({
  id,
  author,
  number,
}: {
  id: string
  author: string
  number: number
}) {
  const [open, setOpen] = useState(false)
  // Al cerrar el diálogo remontamos la votación de la tarjeta para que recoja
  // el voto que se haya hecho dentro del diálogo.
  const [voteKey, setVoteKey] = useState(0)
  const src = `/proyectos/${id}/index.html`
  const title = `Póster animado de ${author}`

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setVoteKey((key) => key + 1)
      }}
    >
      <figure className="@container col-span-12 sm:col-span-6 lg:col-span-4 2xl:col-span-3">
        <div className="relative bg-white p-[10px] shadow-sm">
          {/*
           * En la galería se muestra una captura estática: así ningún póster
           * consume CPU/GPU hasta que se amplía. La versión interactiva solo
           * se carga dentro del diálogo.
           */}
          <Dialog.Trigger
            aria-label={`Ver el póster interactivo ${number} de ${author}`}
            className="group relative block aspect-[848/1200] w-full cursor-pointer overflow-hidden bg-[#fafafa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
          >
            <Image
              src={`/capturas/${id}.webp`}
              alt={`Captura del póster ${number} de ${author}`}
              width={640}
              height={906}
              sizes="(min-width: 1536px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              unoptimized
              className="block h-full w-full object-cover"
            />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-neutral-950/75 py-2 text-sm font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <PlayIcon aria-hidden="true" className="size-4" />
              Ver interactivo
            </span>
          </Dialog.Trigger>
          <Dialog.Trigger
            aria-label={`Ampliar el póster ${number} de ${author}`}
            className="absolute -top-3 -right-3 flex size-9 cursor-pointer items-center justify-center rounded-full bg-white text-neutral-950 shadow-md transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
          >
            <ZoomInIcon aria-hidden="true" className="size-5" />
          </Dialog.Trigger>
        </div>
        <figcaption className="mt-3">
          <PosterVote
            key={voteKey}
            poster={id}
            author={author}
            number={number}
          />
        </figcaption>
      </figure>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-neutral-950/40 backdrop-blur-md transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
        <Dialog.Viewport className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
          <Dialog.Popup
            style={{ width: DIALOG_WIDTH }}
            className="@container relative shrink-0 bg-[#f5f5f5] p-4 text-neutral-950 shadow-2xl transition-[scale,opacity] duration-200 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0"
          >
            <Dialog.Title className="sr-only">
              Póster {number} de {author}
            </Dialog.Title>
            <div className="bg-white p-[10px] shadow-sm">
              <PosterFrame src={src} title={title} />
            </div>
            <div className="mt-3">
              <PosterVote poster={id} author={author} number={number} />
            </div>
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

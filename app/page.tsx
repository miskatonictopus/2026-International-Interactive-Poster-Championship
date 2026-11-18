import { LiveVoteTotalsProvider } from "@/components/live-vote-totals"
import { PosterVote } from "@/components/poster-vote"
import { posters } from "@/lib/posters"

export default function Page() {
  return (
    <main
      lang="es"
      className="min-h-svh bg-[#f5f5f5] px-6 py-12 text-neutral-950"
    >
      <div className="mx-auto grid w-full max-w-[1368px] grid-cols-12 gap-x-6 gap-y-8">
        <h1
          lang="en"
          className="col-span-12 self-center text-[length:clamp(2.25rem,11vw,4rem)] leading-[0.8em] font-black tracking-[-0.06em] wrap-break-word md:col-span-6 md:text-[length:clamp(2.25rem,6.2vw,4rem)]"
        >
          <span className="text-red-600">2026</span> International Interactive
          Poster Championship
        </h1>
        <div className="col-span-12 space-y-3 self-center text-right leading-[1.1em] font-light tracking-[-0.03em] md:col-span-6">
          <p>
            En Planeta FP hemos creado, en colaboración con la Fundación Ítaca,
            una serie de carteles solidarios. Cada propuesta tiene una versión
            en papel y otra animada. Todas comparten un mismo propósito: dar a
            conocer la labor de la fundación y animar a donar para apoyar a
            niños y niñas en riesgo de exclusión social.
          </p>
          <p className="font-bold">
            Explora los carteles, descubre cómo cobran vida y vota por el que
            más te guste.
          </p>
        </div>
        <hr className="col-span-full border-t border-[#0a0a0a]" />
        <LiveVoteTotalsProvider>
          <div className="col-span-full grid grid-cols-12 gap-6">
            {posters.map(({ id, author }, index) => (
              <figure
                key={id}
                className="@container col-span-12 sm:col-span-6 lg:col-span-4 2xl:col-span-3"
              >
                <div className="bg-white p-[10px] shadow-sm">
                  <iframe
                    src={`/proyectos/${id}/index.html`}
                    title={`Póster animado de ${author}`}
                    className="block aspect-[848/1200] w-full border-0 bg-[#fafafa]"
                  />
                </div>
                <figcaption className="mt-3">
                  <PosterVote poster={id} author={author} number={index + 1} />
                </figcaption>
              </figure>
            ))}
          </div>
        </LiveVoteTotalsProvider>
      </div>
    </main>
  )
}

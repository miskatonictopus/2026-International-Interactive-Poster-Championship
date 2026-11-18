import { PosterVote } from "@/components/poster-vote"
import { posters } from "@/lib/posters"

export default function Page() {
  return (
    <main lang="es" className="min-h-svh bg-[#f5f5f5] px-6 py-12 text-neutral-950">
      <div className="mx-auto grid w-full max-w-[1368px] grid-cols-12 gap-y-8">
        <h1
          lang="en"
          className="col-span-12 text-[4em] leading-[0.8em] font-black tracking-[-0.06em] wrap-break-word md:col-span-6"
        >
          <span className="text-red-600">2026</span>{" "}
          International Interactive Poster Championship
        </h1>
        <p className="col-span-12 text-right leading-relaxed md:col-span-6">
          Este es un texto de ejemplo para la introducción del proyecto.
        </p>
        <hr className="col-span-full border-t border-[#0a0a0a]" />
        <div className="col-span-full grid grid-cols-12 gap-6">
          {posters.map(({ id, author, course }) => (
            <figure key={id} className="col-span-12 md:col-span-3">
              <div className="bg-white p-[10px] shadow-sm">
                <iframe
                  src={`/proyectos/${id}/index.html`}
                  title={`Póster animado de ${author}`}
                  className="block aspect-[848/1200] w-full border-0 bg-[#fafafa]"
                />
              </div>
              <figcaption className="mt-3 text-sm">
                <div className="flex items-baseline justify-between gap-2 tracking-[-0.02em]">
                  <span>
                    <strong>Autor:</strong> {author}
                  </span>
                  <strong className="shrink-0 text-right whitespace-nowrap">
                    {course}
                  </strong>
                </div>
                <hr className="mt-2 border-t border-neutral-300" />
                <PosterVote poster={id} author={author} />
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </main>
  )
}

import { LiveVoteTotalsProvider } from "@/components/live-vote-totals"
import { PosterCard } from "@/components/poster-card"
import { RankingDialog } from "@/components/ranking-dialog"
import { posters } from "@/lib/posters"
import { connection } from "next/server"

// Fisher–Yates: every order is equally likely
function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export default async function Page() {
  // Render per request so each visit gets a fresh order (no build-time prerender)
  await connection()
  // Each poster keeps its fixed number; only the display order is random,
  // so no poster gets the advantage of always appearing first.
  const shuffledPosters = shuffle(
    posters.map((poster, index) => ({ ...poster, number: index + 1 }))
  )

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
        <div className="col-span-full flex justify-end">
          <RankingDialog
            posters={posters.map(({ id, author }) => ({ id, author }))}
          />
        </div>
        <hr className="col-span-full border-t border-[#0a0a0a]" />
        <LiveVoteTotalsProvider>
          <div className="col-span-full grid grid-cols-12 gap-6">
            {shuffledPosters.map(({ id, author, number }) => (
              <PosterCard key={id} id={id} author={author} number={number} />
            ))}
          </div>
        </LiveVoteTotalsProvider>
      </div>
    </main>
  )
}

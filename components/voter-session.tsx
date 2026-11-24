"use client"

import { Dialog } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

export type Session = {
  email: string | null
  votes: Record<string, number>
  max: number
  open: boolean
}

type VoterSessionValue = {
  /** null mientras carga */
  session: Session | null
  /** Abre el diálogo de acceso; resuelve true si la persona verifica su correo. */
  login: () => Promise<boolean>
  logout: () => Promise<void>
  /** Actualiza la nota propia tras guardar un voto. */
  recordVote: (poster: string, rating: number) => void
  /** Vuelve a pedir la sesión (p. ej. si el servidor dice que ha caducado). */
  refresh: () => void
}

const VoterSessionContext = createContext<VoterSessionValue | null>(null)

export function useVoterSession() {
  const value = useContext(VoterSessionContext)
  if (!value) throw new Error("useVoterSession fuera de VoterSessionProvider")
  return value
}

const errorMessages: Record<string, string> = {
  invalid: "Revisa el correo: no parece válido.",
  "rate-limited":
    "Se han pedido demasiados códigos. Espera un minuto y vuelve a intentarlo.",
  "wrong-code": "El código no es correcto o ha caducado.",
  failed: "No se ha podido completar. Inténtalo de nuevo.",
}

export function VoterSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [reload, setReload] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const pending = useRef<((ok: boolean) => void) | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/sesion", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Session | null) => {
        if (data) setSession(data)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [reload])

  const finish = useCallback((ok: boolean) => {
    pending.current?.(ok)
    pending.current = null
    setDialogOpen(false)
  }, [])

  const value = useMemo<VoterSessionValue>(
    () => ({
      session,
      login: () => {
        pending.current?.(false)
        setDialogOpen(true)
        return new Promise((resolve) => {
          pending.current = resolve
        })
      },
      logout: async () => {
        await fetch("/api/sesion", { method: "DELETE" }).catch(() => {})
        setSession(
          (current) => current && { ...current, email: null, votes: {} }
        )
      },
      recordVote: (poster, rating) =>
        setSession(
          (current) =>
            current && {
              ...current,
              votes: { ...current.votes, [poster]: rating },
            }
        ),
      refresh: () => setReload((n) => n + 1),
    }),
    [session]
  )

  return (
    <VoterSessionContext.Provider value={value}>
      {children}
      <LoginDialog
        open={dialogOpen}
        onCancel={() => finish(false)}
        onLoggedIn={(data) => {
          setSession(data)
          finish(true)
        }}
      />
    </VoterSessionContext.Provider>
  )
}

function LoginDialog({
  open,
  onCancel,
  onLoggedIn,
}: {
  open: boolean
  onCancel: () => void
  onLoggedIn: (session: Session) => void
}) {
  const [email, setEmail] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function post(url: string, body: object) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(
        response.status === 423 ? "closed" : (data.error ?? "failed")
      )
    }
    return data
  }

  function fail(error: unknown) {
    const reason = error instanceof Error ? error.message : "failed"
    setError(
      reason === "closed"
        ? "La votación solo está abierta en la web oficial."
        : (errorMessages[reason] ?? errorMessages.failed)
    )
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const data = await post("/api/sesion/codigo", { email })
      setSentTo(data.email)
      setCode("")
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !sentTo) return
    setBusy(true)
    setError(null)
    try {
      const data: Session = await post("/api/sesion/verificar", {
        email: sentTo,
        code,
      })
      onLoggedIn(data)
      setSentTo(null)
      setCode("")
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  const input =
    "mt-1 w-full rounded-md border border-neutral-400 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-950"
  const button =
    "w-full rounded-md bg-[#0a0a0a] px-4 py-2.5 font-semibold text-white uppercase enabled:cursor-pointer disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null)
          onCancel()
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-neutral-950/40 backdrop-blur-md transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
          <Dialog.Popup className="relative w-full max-w-sm bg-[#f5f5f5] p-6 text-neutral-950 shadow-2xl transition-[scale,opacity] duration-200 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0">
            <Dialog.Title className="text-2xl font-black tracking-[-0.04em]">
              Vota con tu correo
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-snug text-neutral-700">
              Cada persona puede puntuar hasta 3 carteles. Te enviamos un código
              para comprobar que el correo es tuyo.
            </Dialog.Description>

            {!sentTo ? (
              <form onSubmit={requestCode} className="mt-5 space-y-4">
                <label className="block text-sm font-semibold">
                  Correo electrónico
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={input}
                  />
                </label>
                <button type="submit" disabled={busy} className={button}>
                  {busy ? "Enviando…" : "Enviar código"}
                </button>
              </form>
            ) : (
              <form onSubmit={verify} className="mt-5 space-y-4">
                <p className="text-sm">
                  Hemos enviado un código a <strong>{sentTo}</strong>. Mira
                  también en la carpeta de spam.
                </p>
                <label className="block text-sm font-semibold">
                  Código
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9 ]{6,12}"
                    maxLength={12}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    className={`${input} tracking-[0.3em] tabular-nums`}
                  />
                </label>
                <button type="submit" disabled={busy} className={button}>
                  {busy ? "Comprobando…" : "Entrar y votar"}
                </button>
                <button
                  type="button"
                  className="w-full text-sm underline enabled:cursor-pointer"
                  onClick={() => {
                    setSentTo(null)
                    setError(null)
                  }}
                >
                  Usar otro correo
                </button>
              </form>
            )}

            {error && (
              <p
                role="alert"
                className="mt-4 text-sm font-semibold text-red-700"
              >
                {error}
              </p>
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

/** Línea de estado: quién vota y cuántos votos le quedan. */
export function VoterStatus() {
  const { session, login, logout } = useVoterSession()
  if (!session || !session.open) return null

  if (!session.email) {
    return (
      <p className="text-sm">
        Cada persona puede puntuar hasta {session.max} carteles.{" "}
        <button
          type="button"
          onClick={() => login()}
          className="cursor-pointer font-semibold underline"
        >
          Entra con tu correo para votar
        </button>
      </p>
    )
  }

  const used = Object.keys(session.votes).length
  const left = Math.max(0, session.max - used)
  return (
    <p className="text-sm">
      Votando como <strong>{session.email}</strong> ·{" "}
      {left === 0
        ? `Has usado tus ${session.max} votos`
        : `Te ${left === 1 ? "queda 1 voto" : `quedan ${left} votos`} de ${session.max}`}{" "}
      ·{" "}
      <button
        type="button"
        onClick={() => logout()}
        className="cursor-pointer underline"
      >
        Salir
      </button>
    </p>
  )
}

"use client";

/**
 * Sorteos — port fiel del SorteosTab + SorteoSpinner + SorteosSummaryPanel
 * del ERP CubaOne: el ganador se elige por AZAR UNIFORME antes de animar
 * (la rueda de 10s solo frena visualmente sobre él), se registra en la
 * tabla y el historial/panel se calculan como el original.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Trophy,
  Users,
  Play,
  RefreshCw,
  Trash2,
  CheckCircle2,
  PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  raffleParticipantsAction,
  createRaffleAction,
  deleteRaffleAction,
} from "./actions";
import type { Participante } from "./queries";

const fmtMoney = (n: number | string) =>
  "$" +
  Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export type RaffleDto = {
  id: string;
  nombre: string;
  mes: number;
  anio: number;
  numParticipantes: number;
  ganadorClientName: string;
  ganadorTelefono: string | null;
  ganadorNumOps: number;
  ganadorTotalCreditos: string;
  fechaSorteo: string; // ISO
};

const WHEEL_DURATION = 10000;

/** Easing en dos fases del ERP: 28% giro rápido, 72% frenado cuadrático. */
function wheelEase(t: number): number {
  if (t < 0.28) return (t / 0.28) * 0.8;
  const u = (t - 0.28) / 0.72;
  return 0.8 + (1 - (1 - u) * (1 - u)) * 0.2;
}

export function RafflesView({ history }: Readonly<{ history: RaffleDto[] }>) {
  const t = useTranslations("app.raffles");
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [nombre, setNombre] = useState("");
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [loadingP, startLoadP] = useTransition();
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [pendingWinner, setPendingWinner] = useState<Participante | null>(null);
  const [savedWinner, setSavedWinner] = useState<string | null>(null);
  // Cada carga remonta la rueda (reset de fase sin setState en efectos).
  const [spinKey, setSpinKey] = useState(0);
  const months = t("months").split(",");
  const anios = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  function fetchParticipantes(a: number, m: number) {
    startLoadP(async () => {
      const res = await raffleParticipantsAction(a, m);
      if (res.error) toast.error(res.error);
      else setParticipantes(res.participantes ?? []);
    });
  }

  function loadParticipantes(a = anio, m = mes) {
    setPendingWinner(null);
    setSavedWinner(null);
    setSpinKey((k) => k + 1);
    fetchParticipantes(a, m);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => fetchParticipantes(anio, mes), []);

  function handleSave() {
    if (!pendingWinner) return;
    startSave(async () => {
      const res = await createRaffleAction({
        nombre: nombre || `${t("raffleDefault")} ${months[mes - 1]} ${anio}`,
        mes,
        anio,
        ganadorClientName: pendingWinner.client_name,
        ganadorPan: pendingWinner.pan_origen,
        ganadorTelefono: pendingWinner.telefono,
        ganadorNumOps: pendingWinner.num_ops,
        ganadorTotalCreditos: pendingWinner.total_creditos,
        numParticipantes: participantes.length,
      });
      if (res?.error) toast.error(res.error);
      else setSavedWinner(pendingWinner.client_name);
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm(t("deleteConfirm"))) return;
    startDelete(async () => {
      const res = await deleteRaffleAction(id);
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex flex-1 flex-col gap-4">
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t("month")}
            value={mes}
            onChange={(e) => {
              const m = parseInt(e.target.value, 10);
              setMes(m);
              loadParticipantes(anio, m);
            }}
            className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            {months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            aria-label={t("year")}
            value={anio}
            onChange={(e) => {
              const a = parseInt(e.target.value, 10);
              setAnio(a);
              loadParticipantes(a, mes);
            }}
            className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={`${t("raffleDefault")} ${months[mes - 1]} ${anio}`}
            aria-label={t("raffleName")}
            className="h-8 min-w-48 flex-1 text-sm"
          />
          <Button
            size="sm"
            variant="ghost"
            type="button"
            aria-label={t("refresh")}
            onClick={() => loadParticipantes()}
          >
            <RefreshCw
              className={`size-4 ${loadingP ? "animate-spin" : ""}`}
              aria-hidden
            />
          </Button>
        </div>

        {/* Card del sorteo */}
        <Card>
          <CardContent className="pt-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Trophy className="size-4 text-primary" aria-hidden />
                {t("raffleHeader", { mes: months[mes - 1], anio })}
              </p>
              {participantes.length > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
                  <Users className="size-3.5" aria-hidden />
                  {t("participants", { n: participantes.length })}
                </span>
              )}
            </div>
            {loadingP ? (
              <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <RefreshCw className="size-4 animate-spin" aria-hidden />
                {t("loadingParticipants")}
              </p>
            ) : (
              <SorteoSpinner
                key={spinKey}
                participantes={participantes}
                onWinner={setPendingWinner}
              />
            )}
          </CardContent>
        </Card>

        {/* Ganador pendiente */}
        {pendingWinner && (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
              {savedWinner ? (
                <p className="flex items-center gap-2 text-sm font-medium text-success">
                  <CheckCircle2 className="size-4" aria-hidden />
                  {t("winnerSaved", { name: savedWinner })}
                </p>
              ) : (
                <>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t("winnerSelected")}
                    </p>
                    <p className="text-lg font-bold">
                      {pendingWinner.client_name}
                    </p>
                    <p className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>
                        {t("transfersN", { n: pendingWinner.num_ops })}
                      </span>
                      <span data-numeric="">
                        {t("totalLabel")}:{" "}
                        {fmtMoney(pendingWinner.total_creditos)}
                      </span>
                      {pendingWinner.telefono && (
                        <a
                          href={`tel:+${pendingWinner.telefono}`}
                          className="text-primary"
                        >
                          +{pendingWinner.telefono}
                        </a>
                      )}
                      {pendingWinner.pan_origen && (
                        <span className="font-mono">
                          {pendingWinner.pan_origen}
                        </span>
                      )}
                    </p>
                  </div>
                  <Button type="button" disabled={saving} onClick={handleSave}>
                    <Trophy className="size-4" aria-hidden />
                    {saving ? "…" : t("registerWinner")}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Participantes */}
        {participantes.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <p className="mb-2 text-sm font-semibold">
                {t("participantsTitle")} ({participantes.length})
              </p>
              <div className="max-h-96 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b bg-muted text-left">
                    <tr>
                      <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                        #
                      </th>
                      <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                        {t("name")}
                      </th>
                      <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                        {t("transfers")}
                      </th>
                      <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
                        {t("totalLabel")}
                      </th>
                      <th className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                        {t("phone")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {participantes.map((p, i) => {
                      const isWinner =
                        pendingWinner?.client_name === p.client_name &&
                        pendingWinner?.pan_origen === p.pan_origen;
                      return (
                        <tr
                          key={`${p.client_name}|${p.pan_origen}`}
                          className={isWinner ? "bg-primary/10" : ""}
                        >
                          <td className="px-2 py-1.5 font-mono text-muted-foreground">
                            {i + 1}
                          </td>
                          <td className="px-2 py-1.5 font-medium">
                            {p.client_name}
                            {isWinner && (
                              <Trophy
                                className="ml-1 inline size-3.5 text-primary"
                                aria-hidden
                              />
                            )}
                          </td>
                          <td
                            className="px-2 py-1.5 text-right"
                            data-numeric=""
                          >
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                              {p.num_ops}
                            </span>
                          </td>
                          <td
                            className="px-2 py-1.5 text-right font-mono"
                            data-numeric=""
                          >
                            {fmtMoney(p.total_creditos)}
                          </td>
                          <td className="px-2 py-1.5">
                            {p.telefono ? (
                              <a
                                href={`tel:+${p.telefono}`}
                                className="text-primary underline-offset-4 hover:underline"
                              >
                                +{p.telefono}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Historial */}
        {history.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <p className="mb-2 text-sm font-semibold">
                {t("historyTitle")} ({history.length})
              </p>
              <ul className="flex flex-col divide-y">
                {history.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-2 py-2 text-sm"
                  >
                    <Trophy className="size-4 text-primary" aria-hidden />
                    <span className="font-medium">{s.ganadorClientName}</span>
                    <span className="text-xs text-muted-foreground">
                      {months[s.mes - 1]} {s.anio} · {s.nombre} ·{" "}
                      {t("participants", { n: s.numParticipantes })} ·{" "}
                      {t("transfersN", { n: s.ganadorNumOps })} ·{" "}
                      {fmtMoney(s.ganadorTotalCreditos)}
                      {s.ganadorTelefono && (
                        <>
                          {" · "}
                          <a
                            href={`tel:+${s.ganadorTelefono}`}
                            className="text-primary"
                          >
                            +{s.ganadorTelefono}
                          </a>
                        </>
                      )}
                      {" · "}
                      {new Date(s.fechaSorteo).toLocaleDateString("es-ES")}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      className="ml-auto"
                      aria-label={t("delete")}
                      disabled={deleting}
                      onClick={() => handleDelete(s.id)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <SummaryPanel history={history} />
    </div>
  );
}

// ---------- Rueda (SorteoSpinner del ERP) ----------

function SorteoSpinner({
  participantes,
  onWinner,
}: Readonly<{
  participantes: Participante[];
  onWinner: (p: Participante) => void;
}>) {
  const t = useTranslations("app.raffles");
  const [phase, setPhase] = useState<"idle" | "spinning" | "done">("idle");
  const [displayName, setDisplayName] = useState("");
  const [winner, setWinner] = useState<Participante | null>(null);
  const pickedRef = useRef<Participante | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  function startSpin() {
    if (participantes.length === 0 || phase === "spinning") return;
    // El ganador se decide ANTES de animar (azar uniforme, como el ERP)
    pickedRef.current =
      participantes[Math.floor(Math.random() * participantes.length)];
    setPhase("spinning");
    setWinner(null);
    const start = performance.now();
    const winnerIdx = Math.max(0, participantes.indexOf(pickedRef.current));
    // Vueltas totales: cubre ~80% de los nombres en la fase rápida y
    // aterriza exactamente en el ganador.
    const totalSteps = participantes.length * 4 + winnerIdx;

    const frame = (now: number) => {
      const tt = Math.min(1, (now - start) / WHEEL_DURATION);
      const eased = wheelEase(tt);
      const step = Math.floor(eased * totalSteps) % participantes.length;
      setDisplayName(participantes[step].client_name);
      if (tt < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        setDisplayName(pickedRef.current!.client_name);
        // lock-in de 1s antes de revelar (como el ERP)
        setTimeout(() => {
          setWinner(pickedRef.current);
          setPhase("done");
          onWinner(pickedRef.current!);
        }, 1000);
      }
    };
    rafRef.current = requestAnimationFrame(frame);
  }

  if (participantes.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        <Users className="mx-auto mb-2 size-6" aria-hidden />
        {t("noParticipants")}
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-lg font-semibold">{t("whoWins")}</p>
        <p className="text-sm text-muted-foreground">
          {t("participantsThisMonth", { n: participantes.length })}
        </p>
        <Button type="button" onClick={startSpin}>
          <Play className="size-4" aria-hidden /> {t("startRaffle")}
        </Button>
      </div>
    );
  }

  if (phase === "spinning") {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="rounded-md border px-6 py-4 text-2xl font-bold blur-[0.5px]">
          {displayName}
        </p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" aria-hidden />
          {t("spinning")}
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center gap-2 py-8">
      <Confetti />
      <PartyPopper className="size-8 text-primary" aria-hidden />
      <p className="t-display text-2xl tracking-[-0.025em]">
        {winner?.client_name}
      </p>
      {winner?.pan_origen && (
        <p className="font-mono text-xs text-muted-foreground">
          {winner.pan_origen}
        </p>
      )}
      <p className="text-sm text-muted-foreground" data-numeric="">
        {t("transfersN", { n: winner?.num_ops ?? 0 })} · {t("totalLabel")}:{" "}
        {fmtMoney(winner?.total_creditos ?? 0)}
      </p>
      <Button
        size="sm"
        variant="outline"
        type="button"
        onClick={() => setPhase("idle")}
      >
        <RefreshCw className="size-4" aria-hidden /> {t("newRaffle")}
      </Button>
    </div>
  );
}

/** Confeti CSS puro (18 piezas, sin dependencias). */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: `${(i * 53) % 100}%`,
        delay: `${(i % 6) * 0.12}s`,
        hue: (i * 47) % 360,
      })),
    [],
  );
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 size-2 animate-bounce rounded-sm"
          style={{
            left: p.left,
            animationDelay: p.delay,
            backgroundColor: `hsl(${p.hue} 80% 60%)`,
          }}
        />
      ))}
    </div>
  );
}

// ---------- Panel lateral (SorteosSummaryPanel del ERP) ----------

function SummaryPanel({ history }: Readonly<{ history: RaffleDto[] }>) {
  const t = useTranslations("app.raffles");
  const anioActual = new Date().getFullYear();
  const total = history.length;
  const esteAnio = history.filter((s) => s.anio === anioActual).length;
  const totalPart = history.reduce((a, s) => a + s.numParticipantes, 0);
  const promedioPart = total > 0 ? totalPart / total : 0;
  const valorPremios = history.reduce(
    (a, s) => a + Number(s.ganadorTotalCreditos),
    0,
  );
  const topGanadores = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of history) {
      map.set(s.ganadorClientName, (map.get(s.ganadorClientName) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [history]);
  const meses = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of history) map.set(s.mes, (map.get(s.mes) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [history]);
  const MES_LABEL = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];

  return (
    <aside className="flex w-full flex-col gap-4 lg:w-64">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-4 text-sm">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("panelTotal")}
            </p>
            <p className="text-3xl font-bold" data-numeric="">
              {total}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("panelMeta", { anio: esteAnio, part: totalPart })}
            </p>
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("topWinners")}
            </p>
            {topGanadores.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noRaffles")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {topGanadores.map(([name, n], i) => (
                  <li key={name} className="flex justify-between gap-2 text-xs">
                    <span className="truncate">
                      {i + 1}. {name}
                    </span>
                    <span data-numeric="">{n}×</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("monthlyConc")}
            </p>
            {meses.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noData")}</p>
            ) : (
              meses.map(([m, n]) => (
                <div key={m} className="mb-1">
                  <div className="flex justify-between text-xs">
                    <span>{MES_LABEL[m - 1]}</span>
                    <span data-numeric="">{n}</span>
                  </div>
                  <div className="h-1.5 w-full rounded bg-muted">
                    <div
                      className="h-1.5 rounded bg-primary"
                      style={{ width: `${(n / total) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("metrics")}
            </p>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t("prizesValue")}</span>
              <span data-numeric="">{fmtMoney(valorPremios)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {t("avgParticipation")}
              </span>
              <span data-numeric="">{promedioPart.toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {t("inYear", { anio: anioActual })}
              </span>
              <span data-numeric="">{esteAnio}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

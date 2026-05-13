import { useMemo, useState, useEffect } from "react";
import {
  SPEC_META,
  DEFAULT_PROF_NAMES,
  toDateStr,
  specTemSessaoNoTurno,
  suspensaoRegistroNaoExpirado,
  specSuspensaoAfetaAgenda,
  parseAtendimentoSuspensoSlotKey,
  suspensaoPontualSlotVisivelParaAgente,
  normalizeFeriadosList,
  shouldShowAvisoVisitaDomiciliarAmanha,
  avisoSemAtendimentoUbAmanha,
  addDaysLocal,
  varianteVisitaDomiciliarNoCard,
  estaDentroAlgumaJanelaSolicitacaoAgendamento,
  MSG_FORA_EXPEDIENTE_UBS,
  agenteOcultarCardPorEncerrado,
  specAtendimentoHojeOcultoAposTurnos,
} from "../services/scheduleConfig";

function dataHojeIso() {
  return toDateStr(new Date());
}

function dataSuspensaoPosteriorAHoje(isoStr, hojeStr) {
  return typeof isoStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(isoStr.trim()) && isoStr.trim() > hojeStr;
}

function formatDataLonga(isoDateStr) {
  return new Date(`${isoDateStr}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function nomeProfissional(specKey, profissionaisMap) {
  const p = Object.values(profissionaisMap || {}).find((x) => x.specKey === specKey || x.id === specKey);
  const n = typeof p?.nome === "string" ? p.nome.trim() : "";
  if (n) return n;
  return DEFAULT_PROF_NAMES[specKey] || specKey;
}

function labelEscopoSuspensaoPontual(escopo) {
  if (escopo === "dia") return "dia inteiro";
  if (escopo === "manha") return "manhã";
  if (escopo === "tarde") return "tarde";
  return escopo;
}

/** Há vaga livre na agenda ou sessão com lista de espera / WhatsApp. */
function hasAnyVacancy(specs) {
  return specs.some((spec) =>
    spec.sessions.some((s) => {
      if (s.waitlistEnabled) return true;
      const tot = s.total ?? 0;
      if (tot <= 0) return false;
      return (s.used ?? 0) + (s.reserved ?? 0) < tot;
    })
  );
}

function listaAvisosEncerrado(specs, atendimentoEncerradoMap) {
  const map = atendimentoEncerradoMap || {};
  const out = [];
  for (const spec of specs) {
    const d = spec.atendimentoDate;
    if (typeof d !== "string" || !d) continue;
    const base = `${spec.key}_${d}`;
    const hasM = specTemSessaoNoTurno(spec, "manha");
    const hasT = specTemSessaoNoTurno(spec, "tarde");
    if (map[base]) {
      out.push({ spec, turno: null });
      continue;
    }
    if (hasM && hasT) {
      if (map[`${base}_manha`]) out.push({ spec, turno: "manha" });
      if (map[`${base}_tarde`]) out.push({ spec, turno: "tarde" });
    } else if (hasM && map[`${base}_manha`]) out.push({ spec, turno: "manha" });
    else if (hasT && map[`${base}_tarde`]) out.push({ spec, turno: "tarde" });
  }
  return out;
}

function Card({ tone, children }) {
  const toneStyle = S.cardTone[tone] || S.cardTone.neutral;
  return (
    <div style={{ ...S.card, ...toneStyle }} role="status">
      {children}
    </div>
  );
}

function Section({ title, hint, children, empty }) {
  return (
    <section style={S.section}>
      <div style={S.sectionHead}>
        <h2 style={S.sectionTitle}>{title}</h2>
        {hint ? <p style={S.sectionHint}>{hint}</p> : null}
      </div>
      {empty ? <p style={S.sectionEmpty}>{empty}</p> : children}
    </section>
  );
}

export default function TabAvisos({
  isRecepcao,
  incluirAvisosOperacionais,
  specs = [],
  profissionaisMap = {},
  profNames = {},
  feriados = [],
  pontosFacultativos = [],
  dentQuartaVisitaDomiciliarDesde = "",
  atendimentoEncerradoMap = {},
  atendimentoSuspensoPorSpec = {},
  atendimentoSuspensoSlots = {},
  atendimentoDiasAtivosPorSpec = {},
}) {
  const hoje = dataHojeIso();
  const [agoraRef, setAgoraRef] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgoraRef(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const specsListaAvisos = useMemo(() => {
    const base = (() => {
      if (isRecepcao) return specs;
      return specs.filter((s) => !agenteOcultarCardPorEncerrado(s, atendimentoEncerradoMap || {}));
    })();
    return base.filter((s) => !specAtendimentoHojeOcultoAposTurnos(s, agoraRef));
  }, [specs, atendimentoEncerradoMap, isRecepcao, agoraRef]);

  const semVagasLivresAgente = useMemo(
    () => !isRecepcao && specsListaAvisos.length > 0 && !hasAnyVacancy(specsListaAvisos),
    [isRecepcao, specsListaAvisos]
  );

  const foraExpedienteAgente = useMemo(
    () => !isRecepcao && !estaDentroAlgumaJanelaSolicitacaoAgendamento(agoraRef),
    [isRecepcao, agoraRef]
  );

  const visitasDomicNoCard = useMemo(() => {
    if (!dentQuartaVisitaDomiciliarDesde) return [];
    const out = [];
    for (const spec of specs) {
      const v = varianteVisitaDomiciliarNoCard({
        spec,
        todayStr: hoje,
        desdeStr: dentQuartaVisitaDomiciliarDesde,
      });
      if (!v) continue;
      out.push({ spec, v, nome: nomeProfissional(spec.key, profissionaisMap) });
    }
    return out;
  }, [specs, hoje, dentQuartaVisitaDomiciliarDesde, profissionaisMap]);

  const avisoVisitaDomiciliarAmanha = useMemo(() => {
    if (!incluirAvisosOperacionais || !dentQuartaVisitaDomiciliarDesde) return null;
    if (!shouldShowAvisoVisitaDomiciliarAmanha(hoje, dentQuartaVisitaDomiciliarDesde)) return null;
    const amanhaIso = addDaysLocal(hoje, 1);
    const nomeDent = profNames.dentFernando || DEFAULT_PROF_NAMES.dentFernando;
    return { nomeDent, dataFmt: formatDataLonga(amanhaIso) };
  }, [incluirAvisosOperacionais, dentQuartaVisitaDomiciliarDesde, hoje, profNames]);

  const avisoSemAtendimentoAmanha = useMemo(() => {
    if (!incluirAvisosOperacionais) return null;
    const r = avisoSemAtendimentoUbAmanha(hoje, feriados, pontosFacultativos);
    if (!r) return null;
    return { ...r, dataFmt: formatDataLonga(r.iso) };
  }, [incluirAvisosOperacionais, hoje, feriados, pontosFacultativos]);

  const calendarioFuturo = useMemo(() => {
    const fer = normalizeFeriadosList(feriados).filter((d) => d >= hoje);
    const pf = normalizeFeriadosList(pontosFacultativos).filter((d) => d >= hoje);
    const rows = [];
    for (const iso of fer) rows.push({ iso, tipo: "feriado" });
    for (const iso of pf) {
      if (!rows.some((r) => r.iso === iso && r.tipo === "feriado")) {
        rows.push({ iso, tipo: "pontoFacultativo" });
      } else {
        const row = rows.find((r) => r.iso === iso);
        if (row) row.tipo = "ambos";
      }
    }
    rows.sort((a, b) => a.iso.localeCompare(b.iso));
    return rows;
  }, [feriados, pontosFacultativos, hoje]);

  const suspensaoPeriodo = useMemo(() => {
    const m = atendimentoSuspensoPorSpec || {};
    const entries = Object.entries(m).filter(
      ([, v]) =>
        v &&
        typeof v.desde === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(v.desde.trim()) &&
        suspensaoRegistroNaoExpirado(v, hoje)
    );
    if (isRecepcao) return entries.sort((a, b) => a[1].desde.localeCompare(b[1].desde));
    return entries
      .filter(([specKey]) => specSuspensaoAfetaAgenda(specKey, m, hoje, atendimentoDiasAtivosPorSpec || {}))
      .sort((a, b) => a[1].desde.localeCompare(b[1].desde));
  }, [atendimentoSuspensoPorSpec, atendimentoDiasAtivosPorSpec, hoje, isRecepcao]);

  const suspensaoPontual = useMemo(() => {
    const slots = atendimentoSuspensoSlots || {};
    const diasCfg = atendimentoDiasAtivosPorSpec || {};
    const out = [];
    for (const key of Object.keys(slots)) {
      const p = parseAtendimentoSuspensoSlotKey(key);
      if (!p) continue;
      if (!isRecepcao && !suspensaoPontualSlotVisivelParaAgente(p.specKey, p.data, hoje, diasCfg)) continue;
      if (isRecepcao && p.data < hoje) continue;
      const motivo = typeof slots[key]?.motivo === "string" ? slots[key].motivo.trim() : "";
      out.push({ key, ...p, motivo });
    }
    out.sort((a, b) => (a.data !== b.data ? a.data.localeCompare(b.data) : a.specKey.localeCompare(b.specKey)));
    return out;
  }, [atendimentoSuspensoSlots, atendimentoDiasAtivosPorSpec, hoje, isRecepcao]);

  const encerrados = useMemo(() => {
    if (isRecepcao) return [];
    return listaAvisosEncerrado(specs, atendimentoEncerradoMap);
  }, [specs, atendimentoEncerradoMap, isRecepcao]);

  const temAmanha =
    !!avisoVisitaDomiciliarAmanha ||
    !!avisoSemAtendimentoAmanha;
  const temCalendario = calendarioFuturo.length > 0;
  const temSuspensao = suspensaoPeriodo.length > 0 || suspensaoPontual.length > 0;
  const temEncerrado = encerrados.length > 0;
  const temHorarioVagas = foraExpedienteAgente || semVagasLivresAgente;
  const temVisitaDomicCard = visitasDomicNoCard.length > 0;
  const vazio =
    !temAmanha &&
    !temCalendario &&
    !temSuspensao &&
    !temEncerrado &&
    !temHorarioVagas &&
    !temVisitaDomicCard;

  return (
    <div style={S.wrap}>
      <header style={S.header}>
        <h1 style={S.title}>Avisos</h1>
        <p style={S.lead}>
          Informativos da unidade: calendário, suspensões, encerramentos, horário de expediente e situações que
          afetam o agendamento.
        </p>
      </header>

      {vazio ? (
        <div style={S.empty}>
          <p style={S.emptyTitle}>Nenhum aviso no momento</p>
          <p style={S.emptyText}>
            Quando houver feriados, pontos facultativos, suspensões ou outras situações relevantes, elas aparecerão
            aqui.
          </p>
        </div>
      ) : null}

      {temHorarioVagas ? (
        <Section
          title="Horário da UBS e vagas"
          hint="Para agentes de saúde e direção: atendimento hoje (com vagas) — solicitações das 7h às 18h; outros dias — das 13h30 às 18h."
        >
          <div style={S.cardList}>
            {foraExpedienteAgente ? (
              <Card tone="warn">
                <p style={S.cardLine}>
                  <strong>Fora do horário de solicitações.</strong> {MSG_FORA_EXPEDIENTE_UBS}
                </p>
              </Card>
            ) : null}
            {semVagasLivresAgente ? (
              <Card tone="muted">
                <p style={S.cardLine}>
                  <strong>Não há mais vagas disponíveis.</strong> Todas as vagas de agenda estão preenchidas no
                  momento. Acompanhe novas aberturas pela equipe ou pela recepção.
                </p>
              </Card>
            ) : null}
          </div>
        </Section>
      ) : null}

      {temVisitaDomicCard ? (
        <Section
          title="Odontologia — visitas domiciliares (quartas)"
          hint="Quando a quarta é dedicada a visitas, não há consultas na UBS no turno da manhã."
        >
          <div style={S.cardList}>
            {visitasDomicNoCard.map(({ spec, v, nome }) =>
              v === "vespera" ? (
                <Card key={`${spec.key}_vespera_${spec.atendimentoDate}`} tone="info">
                  <p style={S.cardLine}>
                    <strong>Sem vagas para amanhã</strong> — Na próxima quarta-feira, <strong>{nome}</strong> não
                    atende na unidade pela manhã: a agenda está dedicada a <strong>visitas domiciliares</strong>. Não
                    é possível agendar consulta na UBS nesse turno ({formatDataLonga(spec.atendimentoDate)}).
                  </p>
                </Card>
              ) : (
                <Card key={`${spec.key}_hoje_${spec.atendimentoDate}`} tone="info">
                  <p style={S.cardLine}>
                    <strong>Sem atendimento na unidade hoje</strong> — Em {formatDataLonga(spec.atendimentoDate)},{" "}
                    <strong>{nome}</strong> não realiza consultas na UBS nesta quarta: o atendimento odontológico é
                    exclusivamente em <strong>visita domiciliar</strong>.
                  </p>
                </Card>
              )
            )}
          </div>
        </Section>
      ) : null}

      {temAmanha ? (
        <Section title="Para amanhã" hint="Lembretes do dia anterior ao evento.">
          {avisoVisitaDomiciliarAmanha ? (
            <Card tone="info">
              <p style={S.cardLine}>
                <strong>Visitas domiciliares —</strong> amanhã ({avisoVisitaDomiciliarAmanha.dataFmt}), o{" "}
                {avisoVisitaDomiciliarAmanha.nomeDent} não terá atendimento na unidade pela manhã: estará
                realizando <strong>visitas domiciliares</strong>.
              </p>
            </Card>
          ) : null}
          {avisoSemAtendimentoAmanha ? (
            <Card tone="warn">
              <p style={S.cardLine}>
                {avisoSemAtendimentoAmanha.eFeriado && avisoSemAtendimentoAmanha.ePontoFacultativo ? (
                  <>
                    <strong>Feriado e ponto facultativo —</strong> amanhã ({avisoSemAtendimentoAmanha.dataFmt}) está
                    cadastrado nas duas listas na UBS.
                  </>
                ) : avisoSemAtendimentoAmanha.eFeriado ? (
                  <>
                    <strong>Feriado —</strong> amanhã ({avisoSemAtendimentoAmanha.dataFmt}) é feriado na UBS.
                  </>
                ) : (
                  <>
                    <strong>Ponto facultativo —</strong> amanhã ({avisoSemAtendimentoAmanha.dataFmt}) é ponto
                    facultativo na UBS.
                  </>
                )}{" "}
                <strong>Não haverá atendimento agendado</strong> nesse dia.
              </p>
            </Card>
          ) : null}
        </Section>
      ) : null}

      {temCalendario ? (
        <Section
          title="Calendário da UBS"
          hint="Feriados e pontos facultativos cadastrados a partir de hoje."
        >
          <div style={S.cardList}>
            {calendarioFuturo.map((row) => (
              <Card key={`${row.tipo}_${row.iso}`} tone={row.tipo === "feriado" ? "warn" : row.tipo === "ambos" ? "warn" : "calendario"}>
                <p style={S.cardLine}>
                  {row.tipo === "ambos" ? (
                    <>
                      <strong>Feriado e ponto facultativo</strong> em {formatDataLonga(row.iso)}.
                    </>
                  ) : row.tipo === "feriado" ? (
                    <>
                      <strong>Feriado cadastrado</strong> em {formatDataLonga(row.iso)}.
                    </>
                  ) : (
                    <>
                      <strong>Ponto facultativo cadastrado</strong> em {formatDataLonga(row.iso)}.
                    </>
                  )}{" "}
                  Sem atendimento agendado na data.
                </p>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {temSuspensao ? (
        <Section title="Suspensões de atendimento" hint="Profissionais ou turnos sem agendamento na agenda.">
          <div style={S.cardList}>
            {suspensaoPeriodo.map(([specKey, entry]) => {
              const nome = nomeProfissional(specKey, profissionaisMap);
              const role = SPEC_META[specKey]?.role || "";
              const desde = entry.desde.trim();
              const exibirDesde = dataSuspensaoPosteriorAHoje(desde, hoje);
              const ateRaw = typeof entry.ate === "string" ? entry.ate.trim() : "";
              const exibirAte = dataSuspensaoPosteriorAHoje(ateRaw, hoje);
              let fim = "";
              if (entry.indefinido) fim = "Prazo indeterminado.";
              else if (ateRaw && /^\d{4}-\d{2}-\d{2}$/.test(ateRaw)) {
                fim = exibirAte
                  ? `Até ${formatDataLonga(ateRaw)}.`
                  : "Encerra ao final do período cadastrado.";
              } else fim = "Sem data fim cadastrada.";
              return (
                <Card key={`periodo_${specKey}`} tone="danger">
                  <p style={S.cardLine}>
                    <strong>Atendimento suspenso</strong> — {nome}
                    {role ? ` (${role})` : ""}:{" "}
                    {exibirDesde ? (
                      <>
                        sem agendamento na UBS a partir de <strong>{formatDataLonga(desde)}</strong>.
                      </>
                    ) : (
                      <>sem agendamento na UBS (suspensão em vigor).</>
                    )}{" "}
                    {fim}
                  </p>
                </Card>
              );
            })}
            {suspensaoPontual.map((row) => {
              const nome = nomeProfissional(row.specKey, profissionaisMap);
              const role = SPEC_META[row.specKey]?.role || "";
              const turnoTxt = labelEscopoSuspensaoPontual(row.escopo);
              const exibirData = dataSuspensaoPosteriorAHoje(row.data, hoje);
              const corpoTurno =
                row.escopo === "dia"
                  ? "nesta data não haverá atendimento na UBS durante o dia inteiro."
                  : `não haverá atendimento na UBS no turno da ${turnoTxt}.`;
              return (
                <Card key={row.key} tone="danger">
                  <p style={S.cardLine}>
                    <strong>Suspensão pontual</strong> — {nome}
                    {role ? ` (${role})` : ""}:
                    {exibirData ? (
                      <>
                        {" "}
                        em <strong>{formatDataLonga(row.data)}</strong>{" "}
                      </>
                    ) : (
                      " "
                    )}
                    {corpoTurno}
                    {row.motivo ? (
                      <>
                        {" "}
                        <em style={{ fontWeight: 500 }}>Motivo:</em> {row.motivo}
                      </>
                    ) : null}
                  </p>
                </Card>
              );
            })}
          </div>
        </Section>
      ) : null}

      {temEncerrado ? (
        <Section
          title="Atendimentos encerrados"
          hint="Marcados pela recepção no dia do atendimento; os cartões somem da aba Vagas."
        >
          <div style={S.cardList}>
            {encerrados.map(({ spec, turno }) => {
              const nome = nomeProfissional(spec.key, profissionaisMap);
              const hasM = specTemSessaoNoTurno(spec, "manha");
              const hasT = specTemSessaoNoTurno(spec, "tarde");
              let sufixoTurno;
              if (turno === "manha") sufixoTurno = "da manhã";
              else if (turno === "tarde") sufixoTurno = "da tarde";
              else if (hasM && hasT) sufixoTurno = "da manhã e da tarde";
              else if (hasM) sufixoTurno = "da manhã";
              else if (hasT) sufixoTurno = "da tarde";
              else sufixoTurno = null;
              return (
                <Card key={`${spec.key}_${spec.atendimentoDate}_${turno ?? "legado"}`} tone="muted">
                  <p style={S.cardLine}>
                    {sufixoTurno != null ? (
                      <>
                        Atendimento encerrado para <strong>{nome}</strong> no turno {sufixoTurno}.
                      </>
                    ) : (
                      <>
                        Atendimento encerrado para <strong>{nome}</strong>.
                      </>
                    )}
                  </p>
                </Card>
              );
            })}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

const S = {
  wrap: { display: "flex", flexDirection: "column", gap: 20 },
  header: { marginBottom: 4 },
  title: { margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#0F172A" },
  lead: { margin: 0, fontSize: 13, color: "#64748B", lineHeight: 1.5, maxWidth: 640 },
  empty: {
    padding: "20px 18px",
    borderRadius: 12,
    border: "1px dashed #CBD5E1",
    background: "#F8FAFC",
  },
  emptyTitle: { margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "#0F172A" },
  emptyText: { margin: 0, fontSize: 13, color: "#64748B", lineHeight: 1.45 },
  section: { display: "flex", flexDirection: "column", gap: 10 },
  sectionHead: { display: "flex", flexDirection: "column", gap: 2 },
  sectionTitle: { margin: 0, fontSize: 15, fontWeight: 700, color: "#0F172A" },
  sectionHint: { margin: 0, fontSize: 12, color: "#94A3B8" },
  sectionEmpty: { margin: 0, fontSize: 13, color: "#64748B" },
  cardList: { display: "flex", flexDirection: "column", gap: 8 },
  card: { padding: "10px 14px", borderRadius: 10, border: "1px solid #E2E8F0" },
  cardLine: { margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.45 },
  cardTone: {
    info: { borderColor: "#93C5FD", background: "linear-gradient(180deg, #EFF6FF 0%, #DBEAFE 100%)", color: "#1E3A5F" },
    warn: { borderColor: "#FDBA74", background: "linear-gradient(180deg, #FFEDD5 0%, #FEF3C7 100%)", color: "#7C2D12" },
    calendario: { borderColor: "#C4B5FD", background: "linear-gradient(180deg, #F5F3FF 0%, #EDE9FE 100%)", color: "#4C1D95" },
    danger: { borderColor: "#FECACA", background: "linear-gradient(180deg, #FEF2F2 0%, #FFF1F2 100%)", color: "#991B1B" },
    muted: { borderColor: "#CBD5E1", background: "#F8FAFC", color: "#334155" },
    neutral: { background: "#fff", color: "#334155" },
  },
};

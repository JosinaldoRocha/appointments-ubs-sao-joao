import { useMemo, useState, useEffect } from "react";
import {
  SPEC_META,
  DAY_LABEL,
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
  specKeyEstaDesativado,
  ORDEM_DIA_SEMANA_GRADE,
  diasAtendimentoDefaultParaSpec,
  turnosDefaultParaSpecNoDia,
  normalizeAtendimentoDiasTurnosParaSpec,
} from "../services/scheduleConfig";

function dataHojeIso() {
  return toDateStr(new Date());
}

function dataSuspensaoPosteriorAHoje(isoStr, hojeStr) {
  return typeof isoStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(isoStr.trim()) && isoStr.trim() > hojeStr;
}

function proximaAberturaAgendamento(agora, feriadosLista) {
  const holidaySet = new Set(normalizeFeriadosList(feriadosLista));
  const totalMin = agora.getHours() * 60 + agora.getMinutes();
  const hojeStr = toDateStr(agora);
  const dow = agora.getDay();
  const ehDiaUtilHoje = dow >= 1 && dow <= 5 && !holidaySet.has(hojeStr);

  if (ehDiaUtilHoje && totalMin < 7 * 60) {
    return "hoje a partir das 7h";
  }

  const base = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const cursor = new Date(base);
  cursor.setDate(cursor.getDate() + 1);
  for (let i = 0; i < 14; i++) {
    const d = cursor.getDay();
    const s = toDateStr(cursor);
    if (d >= 1 && d <= 5 && !holidaySet.has(s)) {
      const diffDias = Math.round((cursor - base) / 86400000);
      const prefixo =
        diffDias === 1
          ? "amanhã"
          : "na " + cursor.toLocaleDateString("pt-BR", { weekday: "long" });
      return `${prefixo} a partir das 13h30`;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
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

function profissionalDocPorSpecKey(profissionaisMap, specKey) {
  return (
    Object.values(profissionaisMap || {}).find((p) => p.specKey === specKey || p.id === specKey) || null
  );
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
  specKeysDesativados = [],
  onRemoverSuspensaoPontual,
  onReativarAtendimentoSpec,
}) {
  const hoje = dataHojeIso();
  const [agoraRef, setAgoraRef] = useState(() => new Date());
  const [modalReativarSpecKey, setModalReativarSpecKey] = useState(null);
  const [reativarDiasSel, setReativarDiasSel] = useState(() => new Set());
  const [reativarTurnosPorDia, setReativarTurnosPorDia] = useState({});
  useEffect(() => {
    const t = setInterval(() => setAgoraRef(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!modalReativarSpecKey) return;
    const sk = modalReativarSpecKey;
    const def = diasAtendimentoDefaultParaSpec(sk);
    const cfg = atendimentoDiasAtivosPorSpec?.[sk];
    const fromCfg = Array.isArray(cfg) ? cfg.filter((d) => ORDEM_DIA_SEMANA_GRADE.includes(d)) : [];
    const initialDias = fromCfg.length > 0 ? fromCfg : [...def];
    setReativarDiasSel(new Set(initialDias));

    const prof = profissionalDocPorSpecKey(profissionaisMap, sk);
    const norm = normalizeAtendimentoDiasTurnosParaSpec(sk, prof?.atendimentoDiasTurnos);
    const turnos = {};
    for (const dia of initialDias) {
      const t = norm?.[dia] || turnosDefaultParaSpecNoDia(sk, dia);
      const hasT = t.length > 0;
      turnos[dia] = {
        manha: hasT ? t.includes("manha") : true,
        tarde: hasT ? t.includes("tarde") : true,
      };
    }
    setReativarTurnosPorDia(turnos);
  }, [modalReativarSpecKey, atendimentoDiasAtivosPorSpec, profissionaisMap]);

  useEffect(() => {
    if (!modalReativarSpecKey) return;
    setReativarTurnosPorDia((prev) => {
      const next = { ...prev };
      for (const d of reativarDiasSel) {
        if (next[d] == null) next[d] = { manha: true, tarde: true };
      }
      for (const k of Object.keys(next)) {
        if (!reativarDiasSel.has(k)) delete next[k];
      }
      return next;
    });
  }, [reativarDiasSel, modalReativarSpecKey]);

  const specsListaAvisos = useMemo(() => {
    if (isRecepcao) return specs;
    return specs.filter((s) => !agenteOcultarCardPorEncerrado(s, atendimentoEncerradoMap || {}));
  }, [specs, atendimentoEncerradoMap, isRecepcao]);

  const semVagasLivresAgente = useMemo(
    () => !isRecepcao && specsListaAvisos.length > 0 && !hasAnyVacancy(specsListaAvisos),
    [isRecepcao, specsListaAvisos]
  );

  const foraExpedienteAgente = useMemo(
    () => !isRecepcao && !estaDentroAlgumaJanelaSolicitacaoAgendamento(agoraRef),
    [isRecepcao, agoraRef]
  );

  const proximaAbertura = useMemo(
    () => proximaAberturaAgendamento(agoraRef, feriados),
    [agoraRef, feriados]
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
      ([specKey, v]) =>
        !specKeyEstaDesativado(specKey, specKeysDesativados) &&
        v &&
        typeof v.desde === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(v.desde.trim()) &&
        suspensaoRegistroNaoExpirado(v, hoje)
    );
    if (isRecepcao) return entries.sort((a, b) => a[1].desde.localeCompare(b[1].desde));
    return entries
      .filter(([specKey]) => specSuspensaoAfetaAgenda(specKey, m, hoje, atendimentoDiasAtivosPorSpec || {}))
      .sort((a, b) => a[1].desde.localeCompare(b[1].desde));
  }, [atendimentoSuspensoPorSpec, atendimentoDiasAtivosPorSpec, hoje, isRecepcao, specKeysDesativados]);

  const suspensaoPontual = useMemo(() => {
    const slots = atendimentoSuspensoSlots || {};
    const diasCfg = atendimentoDiasAtivosPorSpec || {};
    const out = [];
    for (const key of Object.keys(slots)) {
      const p = parseAtendimentoSuspensoSlotKey(key);
      if (!p) continue;
      if (specKeyEstaDesativado(p.specKey, specKeysDesativados)) continue;
      if (!isRecepcao && !suspensaoPontualSlotVisivelParaAgente(p.specKey, p.data, hoje, diasCfg)) continue;
      if (isRecepcao && p.data < hoje) continue;
      const motivo = typeof slots[key]?.motivo === "string" ? slots[key].motivo.trim() : "";
      out.push({ key, ...p, motivo });
    }
    out.sort((a, b) => (a.data !== b.data ? a.data.localeCompare(b.data) : a.specKey.localeCompare(b.specKey)));
    return out;
  }, [atendimentoSuspensoSlots, atendimentoDiasAtivosPorSpec, hoje, isRecepcao, specKeysDesativados]);

  const encerrados = useMemo(
    () => listaAvisosEncerrado(specs, atendimentoEncerradoMap),
    [specs, atendimentoEncerradoMap]
  );

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
          {isRecepcao
            ? "Calendário, suspensões, encerramentos de turno e demais situações que afetam a agenda — gerencie reativações e remoções aqui."
            : "Informativos da unidade: calendário, suspensões, encerramentos, horário de expediente e situações que afetam o agendamento."}
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
                  <strong>Fora do horário de solicitações.</strong>{" "}
                  {proximaAbertura
                    ? `Volte ${proximaAbertura}.`
                    : MSG_FORA_EXPEDIENTE_UBS}
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
        <Section
          title="Suspensões de atendimento"
          hint={
            isRecepcao
              ? "Profissionais ou turnos sem agendamento na agenda. Use os botões para reativar ou remover suspensões pontuais."
              : "Profissionais ou turnos sem agendamento na agenda."
          }
        >
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
                  {isRecepcao && typeof onReativarAtendimentoSpec === "function" ? (
                    <button
                      type="button"
                      style={S.cardActionBtn}
                      onClick={() => setModalReativarSpecKey(specKey)}
                    >
                      Reativar atendimento…
                    </button>
                  ) : null}
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
                  {isRecepcao && typeof onRemoverSuspensaoPontual === "function" ? (
                    <button
                      type="button"
                      style={S.cardActionBtnSecondary}
                      onClick={() => onRemoverSuspensaoPontual(row.key)}
                    >
                      Remover suspensão
                    </button>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </Section>
      ) : null}

      {temEncerrado ? (
        <Section
          title="Atendimentos encerrados"
          hint={
            isRecepcao
              ? "Turnos marcados como encerrados no dia do atendimento; os cartões somem da aba Vagas."
              : "Marcados pela recepção no dia do atendimento; os cartões somem da aba Vagas."
          }
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

      {modalReativarSpecKey && typeof onReativarAtendimentoSpec === "function" && (
        <div
          style={S.modalBackdrop}
          role="presentation"
          onClick={() => setModalReativarSpecKey(null)}
        >
          <div
            style={S.modalBox}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-reativar-avisos"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="titulo-reativar-avisos" style={S.modalTitle}>
              Reativar atendimento
            </h2>
            <p style={S.modalLead}>
              {nomeProfissional(modalReativarSpecKey, profissionaisMap)}
              {SPEC_META[modalReativarSpecKey]?.role
                ? ` (${SPEC_META[modalReativarSpecKey].role})`
                : ""}
            </p>
            <p style={S.modalHint}>
              Marque livremente os dias de <strong>segunda a sexta-feira</strong> e, em cada dia, os{" "}
              <strong>turnos</strong> (manhã e/ou tarde) com atendimento.
            </p>
            <div style={S.modalChecksCol}>
              {ORDEM_DIA_SEMANA_GRADE.map((dia) => {
                const marcado = reativarDiasSel.has(dia);
                const t = reativarTurnosPorDia[dia] || { manha: true, tarde: true };
                return (
                  <div key={dia} style={S.modalDiaTurnoBlock}>
                    <label style={S.modalCheck}>
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => {
                          setReativarDiasSel((prev) => {
                            const n = new Set(prev);
                            if (n.has(dia)) n.delete(dia);
                            else n.add(dia);
                            return n;
                          });
                        }}
                      />
                      <span style={{ fontWeight: 700 }}>{DAY_LABEL[dia] || dia}</span>
                    </label>
                    {marcado && (
                      <div style={S.modalTurnosInline}>
                        <label style={S.modalCheckTurno}>
                          <input
                            type="checkbox"
                            checked={!!t.manha}
                            onChange={() =>
                              setReativarTurnosPorDia((prev) => {
                                const cur = prev[dia] || { manha: true, tarde: true };
                                return { ...prev, [dia]: { ...cur, manha: !cur.manha } };
                              })
                            }
                          />
                          <span>Manhã</span>
                        </label>
                        <label style={S.modalCheckTurno}>
                          <input
                            type="checkbox"
                            checked={!!t.tarde}
                            onChange={() =>
                              setReativarTurnosPorDia((prev) => {
                                const cur = prev[dia] || { manha: true, tarde: true };
                                return { ...prev, [dia]: { ...cur, tarde: !cur.tarde } };
                              })
                            }
                          />
                          <span>Tarde</span>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={S.modalFooter}>
              <button type="button" style={S.modalBtnGhost} onClick={() => setModalReativarSpecKey(null)}>
                Cancelar
              </button>
              <button
                type="button"
                style={S.modalBtnPrimary}
                onClick={() => {
                  const dias = [...reativarDiasSel].filter((d) => ORDEM_DIA_SEMANA_GRADE.includes(d)).sort();
                  if (dias.length === 0) {
                    window.alert("Selecione pelo menos um dia da semana (segunda a sexta-feira).");
                    return;
                  }
                  const turnosFirestore = {};
                  for (const d of dias) {
                    const tu = reativarTurnosPorDia[d] || { manha: true, tarde: true };
                    const arr = [];
                    if (tu.manha) arr.push("manha");
                    if (tu.tarde) arr.push("tarde");
                    if (arr.length === 0) {
                      window.alert(
                        `Para ${DAY_LABEL[d] || d}, marque pelo menos um turno (manhã ou tarde).`
                      );
                      return;
                    }
                    turnosFirestore[d] = arr.sort();
                  }
                  void Promise.resolve(
                    onReativarAtendimentoSpec(modalReativarSpecKey, dias, turnosFirestore)
                  ).then(() => setModalReativarSpecKey(null));
                }}
              >
                Reativar e salvar dias
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: { display: "flex", flexDirection: "column", gap: 20 },
  header: { marginBottom: 4 },
  title: { margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em" },
  lead: { margin: 0, fontSize: 13, color: "#64748B", lineHeight: 1.55, maxWidth: 640 },
  empty: {
    padding: "22px 20px",
    borderRadius: 12,
    border: "1px dashed #CBD5E1",
    background: "#F8FAFC",
  },
  emptyTitle: { margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#0F172A" },
  emptyText: { margin: 0, fontSize: 13, color: "#64748B", lineHeight: 1.5 },
  section: { display: "flex", flexDirection: "column", gap: 10 },
  sectionHead: { display: "flex", flexDirection: "column", gap: 2 },
  sectionTitle: { margin: 0, fontSize: 15, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em" },
  sectionHint: { margin: 0, fontSize: 12, color: "#94A3B8" },
  sectionEmpty: { margin: 0, fontSize: 13, color: "#64748B" },
  cardList: { display: "flex", flexDirection: "column", gap: 8 },
  card: {
    padding: "12px 15px", borderRadius: 12, border: "1px solid #E2E8F0",
    boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
  },
  cardLine: { margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.5 },
  cardActionBtn: {
    marginTop: 10,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 8,
    border: "1px solid #F97316",
    background: "#FFF7ED",
    color: "#9A3412",
    cursor: "pointer",
  },
  cardActionBtnSecondary: {
    marginTop: 10,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 8,
    border: "1px solid #E2E8F0",
    background: "#fff",
    color: "#475569",
    cursor: "pointer",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.48)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 1000,
    backdropFilter: "blur(2px)",
  },
  modalBox: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "90vh",
    overflow: "auto",
    background: "#fff",
    borderRadius: 16,
    padding: "22px 24px",
    boxShadow: "0 20px 60px rgba(15,23,42,0.2), 0 4px 16px rgba(15,23,42,0.08)",
    border: "1px solid #E2E8F0",
  },
  modalTitle: { margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em" },
  modalLead: { margin: "0 0 12px", fontSize: 14, color: "#475569", lineHeight: 1.5 },
  modalHint: { margin: "0 0 14px", fontSize: 13, color: "#64748B", lineHeight: 1.5 },
  modalChecksCol: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 },
  modalDiaTurnoBlock: { display: "flex", flexDirection: "column", gap: 6 },
  modalCheck: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" },
  modalTurnosInline: { display: "flex", gap: 16, paddingLeft: 26 },
  modalCheckTurno: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" },
  modalFooter: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14, paddingTop: 14, borderTop: "1px solid #F1F5F9" },
  modalBtnGhost: {
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 9,
    border: "1.5px solid #E2E8F0",
    background: "#fff",
    color: "#475569",
    cursor: "pointer",
  },
  modalBtnPrimary: {
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 9,
    border: "none",
    background: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(67,56,202,0.3)",
  },
  cardTone: {
    info: { borderColor: "#A5B4FC", background: "linear-gradient(180deg, #EEF2FF 0%, #E0E7FF 100%)", color: "#312E81" },
    warn: { borderColor: "#FDBA74", background: "linear-gradient(180deg, #FFEDD5 0%, #FEF3C7 100%)", color: "#7C2D12" },
    calendario: { borderColor: "#C4B5FD", background: "linear-gradient(180deg, #F5F3FF 0%, #EDE9FE 100%)", color: "#4C1D95" },
    danger: { borderColor: "#FECACA", background: "linear-gradient(180deg, #FEF2F2 0%, #FFF1F2 100%)", color: "#991B1B" },
    muted: { borderColor: "#CBD5E1", background: "#F8FAFC", color: "#334155" },
    neutral: { background: "#fff", color: "#334155" },
  },
};

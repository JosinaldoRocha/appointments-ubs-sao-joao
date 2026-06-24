// src/components/TabVagas.jsx
import { useMemo, useState, useEffect, memo } from "react";
import {
  SPEC_META,
  DAY_LABEL,
  MEDICO_TIPO,
  DEFAULT_PROF_NAMES,
  toDateStr,
  recepcaoPodeMarcarAtendimentoFinalizado,
  estaDentroJanelaSolicitacaoAgendamento,
  msgForaJanelaSolicitacaoAgendamento,
  msgForaDiaAgendamentoPrev,
  varianteVisitaDomiciliarNoCard,
  specTemSessaoNoTurno,
  agenteOcultarCardPorEncerrado,
  indicesSessoesAtendimentoHojeVisiveis,
  reservaSolicitacaoAtiva,
  diasAtendimentoDefaultParaSpec,
  turnosDefaultParaSpecNoDia,
  suspensaoRegistroNaoExpirado,
  filtrarSpecKeysAtivos,
} from "../services/scheduleConfig";
import { fraseVagasEsgotadasEncaixe } from "../services/whatsappSolicitacao";
import { SessaoLabelComDestaqueTurno } from "./SessaoLabelDestaqueTurno";

function dataHojeIso() {
  return toDateStr(new Date());
}

/** Amanhã no calendário local (YYYY-MM-DD). */
function dataAmanhaIso() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return toDateStr(d);
}

/** Data no título: ex. "30 de Março" (sem dia da semana). */
function formatDataTituloSecao(isoDateStr) {
  const raw = new Date(isoDateStr + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
  });
  const i = raw.indexOf(" de ");
  if (i === -1) return raw.charAt(0).toUpperCase() + raw.slice(1);
  const dia = raw.slice(0, i);
  const mes = raw.slice(i + 4);
  return `${dia} de ${mes.charAt(0).toUpperCase() + mes.slice(1)}`;
}

/** Nome longo do dia da semana a partir da data ISO (ex. "Terça-feira"). */
function nomeDiaSemanaLongo(isoDateStr) {
  const raw = new Date(isoDateStr + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

const STYLE_TITULO_DESTAQUE = { color: "#0C447C", fontWeight: 700 };

/**
 * Título da seção conforme a data do agendamento:
 * - hoje → "Atendimento disponível para hoje"
 * - amanhã → "Agendamento para amanhã - [dia da semana] - [dia de mês]"
 * - demais → "Agendamento para [dia da semana] - [dia de mês]"
 */
function TituloAgendamentoDisponivel({ isoDateStr }) {
  if (!isoDateStr) {
    return <span style={STYLE_TITULO_DESTAQUE}>Agendamento</span>;
  }
  const hoje = dataHojeIso();
  const amanha = dataAmanhaIso();

  if (isoDateStr === hoje) {
    return (
      <>
        <span style={STYLE_TITULO_DESTAQUE}>Atendimento</span>
        {" disponível para hoje"}
      </>
    );
  }

  if (isoDateStr === amanha) {
    return (
      <>
        <span style={STYLE_TITULO_DESTAQUE}>Agendamento</span>
        {` para amanhã - ${nomeDiaSemanaLongo(isoDateStr)} - ${formatDataTituloSecao(isoDateStr)}`}
      </>
    );
  }

  return (
    <>
      <span style={STYLE_TITULO_DESTAQUE}>Agendamento</span>
      {` para ${nomeDiaSemanaLongo(isoDateStr)} - ${formatDataTituloSecao(isoDateStr)}`}
    </>
  );
}

/** Menor data ISO entre os cartões da seção (mesmo dia da semana de atendimento). */
function menorAtendimentoDateLista(listaSpecs) {
  let min = null;
  for (const s of listaSpecs) {
    const d = s.atendimentoDate;
    if (typeof d !== "string" || !d) continue;
    if (!min || d < min) min = d;
  }
  return min;
}

/** Agrupa cartões prev por `atendimentoDia`. */
function agruparPrevPorDia(prevSpecs) {
  const map = {};
  for (const spec of prevSpecs) {
    const d = spec.atendimentoDia;
    if (!map[d]) map[d] = [];
    map[d].push(spec);
  }
  return map;
}

/** Lista `{ dia, lista }` ordenada pela menor data de atendimento (crescente). */
function secoesPrevOrdenadasPorData(prevPorDia) {
  return Object.entries(prevPorDia)
    .map(([dia, lista]) => ({
      dia,
      lista,
      dataMin: menorAtendimentoDateLista(lista) || "",
    }))
    .filter((s) => s.lista?.length)
    .sort((a, b) => {
      if (a.dataMin && b.dataMin) return a.dataMin.localeCompare(b.dataMin);
      if (a.dataMin) return -1;
      if (b.dataMin) return 1;
      return 0;
    });
}

/** Nome exibido: campo `nome` em `profissionais` (via specKey), depois rótulos padrão da agenda. */
function nomeProfissionalFirestore(specKey, profissionaisMap) {
  const p = Object.values(profissionaisMap || {}).find(
    (x) => x.specKey === specKey || x.id === specKey
  );
  const n = typeof p?.nome === "string" ? p.nome.trim() : "";
  if (n) return n;
  return DEFAULT_PROF_NAMES[specKey] || specKey;
}

/** Data no card: ex. "Qua., 30 de março" — primeira letra maiúscula (pt-BR costuma vir minúscula). */
function formatDataCardAtendimento(isoDateStr) {
  const raw = new Date(isoDateStr + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Recepção: há vaga livre para agendar ou reserva pendente. */
function podePreencherVaga(reserved, used, total, livres) {
  return livres > 0 || (reserved > 0 && used < total);
}

function preencherVaga({
  vagaId,
  specKey,
  dayKey,
  sessIdx,
  atendimentoDate,
  reserved,
  used,
  total,
  livres,
  onSlotAction,
}) {
  if (livres > 0) {
    onSlotAction({ vagaId, specKey, dayKey, sessIdx, atendimentoDate, action: "incOcupada" });
    return;
  }
  if (reserved > 0 && used < total) {
    onSlotAction({ vagaId, specKey, dayKey, sessIdx, atendimentoDate, action: "confirmarReserva" });
  }
}

function liberarVaga({ vagaId, specKey, dayKey, sessIdx, atendimentoDate, reserved, used, onSlotAction }) {
  if (reserved > 0) {
    onSlotAction({ vagaId, specKey, dayKey, sessIdx, atendimentoDate, action: "decReserva" });
  } else if (used > 0) {
    onSlotAction({ vagaId, specKey, dayKey, sessIdx, atendimentoDate, action: "decOcupada" });
  }
}

/**
 * Recepção: rodapé do card — marcar no turno da manhã ou da tarde (relógio); remover em qualquer
 * horário do mesmo dia.
 */
function recepcaoPrecisaFooterEncerrado(spec, atendimentoEncerradoMap, agora, onToggle) {
  if (typeof onToggle !== "function" || spec.windowType !== "same") return false;
  const hoje = toDateStr(agora);
  if (spec.atendimentoDate !== hoje) return false;
  const map = atendimentoEncerradoMap || {};
  const base = `${spec.key}_${hoje}`;
  const hasM = specTemSessaoNoTurno(spec, "manha");
  const hasT = specTemSessaoNoTurno(spec, "tarde");
  if (!hasM && !hasT) return false;
  if (hasM && hasT) {
    if (map[base]) return true;
    const km = `${base}_manha`;
    const kt = `${base}_tarde`;
    if (map[km] || map[kt]) return true;
    return (
      recepcaoPodeMarcarAtendimentoFinalizado(spec, agora, "manha") ||
      recepcaoPodeMarcarAtendimentoFinalizado(spec, agora, "tarde")
    );
  }
  if (hasM && !hasT) {
    const k = `${base}_manha`;
    if (map[k] || map[base]) return true;
    return recepcaoPodeMarcarAtendimentoFinalizado(spec, agora, "manha");
  }
  if (!hasM && hasT) {
    const k = `${base}_tarde`;
    if (map[k] || map[base]) return true;
    return recepcaoPodeMarcarAtendimentoFinalizado(spec, agora, "tarde");
  }
  return false;
}

function labelEscopoSuspensaoPontual(escopo) {
  if (escopo === "dia") return "dia inteiro";
  if (escopo === "manha") return "manhã";
  if (escopo === "tarde") return "tarde";
  return escopo;
}

/** Turno padrão no modal de suspensão pontual (ex.: enfermeira → tarde; coleta → manhã). */
function turnoPadraoSuspensaoPontual(specKey) {
  const dias = diasAtendimentoDefaultParaSpec(specKey);
  let hasManha = false;
  let hasTarde = false;
  for (const dia of dias) {
    for (const t of turnosDefaultParaSpecNoDia(specKey, dia)) {
      if (t === "manha") hasManha = true;
      if (t === "tarde") hasTarde = true;
    }
  }
  if (hasTarde && !hasManha) return "tarde";
  if (hasManha && !hasTarde) return "manha";
  return "manha";
}

export default function TabVagas({
  specs,
  profissionaisMap = {},
  specKeysDesativados = [],
  isRecepcao,
  onSlotAction,
  onSolicitar,
  atendimentoEncerradoMap = {},
  onToggleAtendimentoEncerrado,
  atendimentoSuspensoPorSpec = {},
  onSuspenderAtendimentoSpec,
  dentQuartaVisitaDomiciliarDesde = "",
  profissionalConfigPorSpec = {},
  usuarioUid = "",
  isDiretor = false,
}) {
  const [agoraRecepcao, setAgoraRecepcao] = useState(() => new Date());
  const [modalSuspenderSpecKey, setModalSuspenderSpecKey] = useState(null);

  const specKeysAtivosAgenda = useMemo(
    () => filtrarSpecKeysAtivos(Object.keys(DEFAULT_PROF_NAMES), specKeysDesativados),
    [specKeysDesativados]
  );
  const [suspendModo, setSuspendModo] = useState("pontual");
  const [suspendPontualData, setSuspendPontualData] = useState("");
  const [suspendPontualEscopo, setSuspendPontualEscopo] = useState("manha");
  const [suspendPontualMotivo, setSuspendPontualMotivo] = useState("");
  const [suspendFormDesde, setSuspendFormDesde] = useState("");
  const [suspendFormIndef, setSuspendFormIndef] = useState(true);
  const [suspendFormAte, setSuspendFormAte] = useState("");

  useEffect(() => {
    const t = setInterval(() => setAgoraRecepcao(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!modalSuspenderSpecKey) return;
    const hoje = dataHojeIso();
    setSuspendModo("pontual");
    setSuspendPontualData(hoje);
    setSuspendPontualEscopo(turnoPadraoSuspensaoPontual(modalSuspenderSpecKey));
    setSuspendPontualMotivo("");
    setSuspendFormDesde(hoje);
    setSuspendFormIndef(true);
    setSuspendFormAte("");
  }, [modalSuspenderSpecKey]);

  const specsLista = useMemo(() => {
    if (isRecepcao) return specs;
    return specs.filter((s) => !agenteOcultarCardPorEncerrado(s, atendimentoEncerradoMap || {}));
  }, [specs, atendimentoEncerradoMap, isRecepcao]);

  const prev = specsLista.filter((s) => s.windowType === "prev");
  const same = specsLista.filter((s) => s.windowType === "same");
  const prevPorDia = agruparPrevPorDia(prev);
  const prevSecoes = secoesPrevOrdenadasPorData(prevPorDia);

  if (specs.length === 0 && !isRecepcao) {
    return (
      <div style={styles.wrap}>
        <div style={styles.empty}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>
            Nenhum agendamento disponível hoje
          </p>
          <p style={{ fontSize: 13, color: "#64748B" }}>
            Em geral, o agendamento abre no último dia útil anterior ao atendimento (feriados e pontos
            facultativos são considerados). Nutrição e psicologia: cartão visível todos os dias; agendamento na véspera ou no dia do atendimento (conforme o card).
          </p>
        </div>
      </div>
    );
  }

  if (specsLista.length === 0 && !isRecepcao) {
    return (
      <div style={styles.empty}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>
          Nenhum cartão de atendimento visível
        </p>
          <p style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>
          Os atendimentos do dia podem sumir da lista quando a recepção marcar o turno como encerrado. Fora do
          horário de solicitações (7h–18h no dia do atendimento; 13h30–18h nos demais), os cartões continuam
          visíveis, mas o agendamento fica bloqueado. Suspensões e lembretes estão na aba <strong>Avisos</strong>.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      {isRecepcao && (
        <div style={styles.legend}>
          <LegendItem color="#DBEAFE" border="#93C5FD" label="Agenda: dia útil anterior ao atendimento" />
          <LegendItem
            color="#ECFDF5"
            border="#6EE7B7"
            label="Nutrição e psicologia: cartão visível todos os dias; agendamento na véspera ou no dia do atendimento"
          />
          <LegendItem color="#DCFCE7" border="#86EFAC" label="Atendimento hoje — vagas sobrando" />
          <LegendItem
            color="#FFFBEB"
            border="#FCD34D"
            label="Cada turno: +2 vagas de encaixe além da agenda (exceto fisioterapia)"
          />
        </div>
      )}

      {isRecepcao && specs.length === 0 && (
        <div style={styles.empty}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>
            Nenhum cartão de agenda neste período
          </p>
          <p style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>
            Se todos os profissionais estiverem com atendimento suspenso, consulte a aba{" "}
            <strong>Avisos</strong> para reativar quando houver profissional na unidade.
          </p>
        </div>
      )}

      {same.length > 0 && (
        <Section
          sentenceTitle
          title={<TituloAgendamentoDisponivel isoDateStr={same[0]?.atendimentoDate} />}
        >
          {same.map((spec) => (
            <SpecCard
              key={`same-${spec.atendimentoDate}_${spec.key}`}
              spec={spec}
              profissionaisMap={profissionaisMap}
              isRecepcao={isRecepcao}
              onSlotAction={onSlotAction}
              onSolicitar={onSolicitar}
              agoraRecepcao={agoraRecepcao}
              atendimentoEncerradoMap={atendimentoEncerradoMap}
              onToggleAtendimentoEncerrado={onToggleAtendimentoEncerrado}
              mostrarBotaoEncerradoRecepcao={recepcaoPrecisaFooterEncerrado(
                spec,
                atendimentoEncerradoMap,
                agoraRecepcao,
                onToggleAtendimentoEncerrado
              )}
              dentQuartaVisitaDomiciliarDesde={dentQuartaVisitaDomiciliarDesde}
              profissionalConfigPorSpec={profissionalConfigPorSpec}
              usuarioUid={usuarioUid}
              isDiretor={isDiretor}
            />
          ))}
        </Section>
      )}

      {prevSecoes.map(({ dia, lista, dataMin }) => (
        <Section
          key={`prev-sec-${dia}-${dataMin || "x"}`}
          sentenceTitle
          title={<TituloAgendamentoDisponivel isoDateStr={dataMin} />}
        >
          {lista.map((spec) => (
            <SpecCard
              key={`prev-${spec.atendimentoDate}_${spec.key}`}
              spec={spec}
              profissionaisMap={profissionaisMap}
              isRecepcao={isRecepcao}
              onSlotAction={onSlotAction}
              onSolicitar={onSolicitar}
              agoraRecepcao={agoraRecepcao}
              atendimentoEncerradoMap={atendimentoEncerradoMap}
              onToggleAtendimentoEncerrado={onToggleAtendimentoEncerrado}
              mostrarBotaoEncerradoRecepcao={recepcaoPrecisaFooterEncerrado(
                spec,
                atendimentoEncerradoMap,
                agoraRecepcao,
                onToggleAtendimentoEncerrado
              )}
              dentQuartaVisitaDomiciliarDesde={dentQuartaVisitaDomiciliarDesde}
              profissionalConfigPorSpec={profissionalConfigPorSpec}
              usuarioUid={usuarioUid}
              isDiretor={isDiretor}
            />
          ))}
        </Section>
      ))}

      {isRecepcao && typeof onSuspenderAtendimentoSpec === "function" && (
        <div style={styles.painelSuspenderAcesso}>
          <p style={styles.painelSuspRecepcaoTitle}>Suspender atendimento de um profissional</p>
          <p style={styles.painelSuspenderAcessoHint}>
            Disponível para qualquer funcionário da agenda (médico, enfermeira, odontologia, etc.), mesmo quando não
            houver cartão visível acima. Use suspensão pontual para um dia/turno ou por período para vários dias.
            Suspensões em vigor e encerramentos estão na aba <strong>Avisos</strong>.
          </p>
          <div style={styles.painelSuspenderAcessoGrid}>
            {specKeysAtivosAgenda.map((specKey) => {
              const meta = SPEC_META[specKey];
              const suspensoPeriodo = suspensaoRegistroNaoExpirado(
                atendimentoSuspensoPorSpec[specKey],
                dataHojeIso()
              );
              return (
                <div key={specKey} style={styles.painelSuspenderAcessoItem}>
                  <div style={styles.painelSuspenderAcessoInfo}>
                    <span
                      style={{
                        ...styles.painelSuspenderAcessoAv,
                        background: meta?.bg || "#F1F5F9",
                        color: meta?.tc || "#475569",
                      }}
                    >
                      {meta?.av || "?"}
                    </span>
                    <div>
                      <p style={styles.painelSuspenderAcessoNome}>
                        {nomeProfissionalFirestore(specKey, profissionaisMap)}
                      </p>
                      <p style={styles.painelSuspenderAcessoRole}>{meta?.role || specKey}</p>
                      {suspensoPeriodo && (
                        <p style={styles.painelSuspenderAcessoBadge}>Suspensão por período em vigor</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    style={styles.btnSuspenderAcessoItem}
                    onClick={() => setModalSuspenderSpecKey(specKey)}
                  >
                    Suspender…
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modalSuspenderSpecKey && typeof onSuspenderAtendimentoSpec === "function" && (
        <div
          style={styles.modalBackdrop}
          role="presentation"
          onClick={() => setModalSuspenderSpecKey(null)}
        >
          <div
            style={{ ...styles.modalBox, ...styles.modalBoxSuspender }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-suspender"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="titulo-suspender" style={styles.modalTitle}>
              Suspender atendimento
            </h2>
            <p style={styles.modalLead}>
              {nomeProfissionalFirestore(modalSuspenderSpecKey, profissionaisMap)}
              {SPEC_META[modalSuspenderSpecKey]?.role
                ? ` (${SPEC_META[modalSuspenderSpecKey].role})`
                : ""}
            </p>
            <div style={styles.modalTipoSuspRow} role="radiogroup" aria-label="Tipo de suspensão">
              <label style={styles.modalTipoSuspOpt}>
                <input
                  type="radio"
                  name="suspendModo"
                  checked={suspendModo === "pontual"}
                  onChange={() => setSuspendModo("pontual")}
                />
                <span>Data e turno específicos</span>
              </label>
              <label style={styles.modalTipoSuspOpt}>
                <input
                  type="radio"
                  name="suspendModo"
                  checked={suspendModo === "periodo"}
                  onChange={() => setSuspendModo("periodo")}
                />
                <span>A partir de uma data (vários dias)</span>
              </label>
            </div>

            {suspendModo === "pontual" && (
              <>
                <label style={styles.modalField}>
                  <span>Data do atendimento afetado</span>
                  <input
                    type="date"
                    value={suspendPontualData}
                    onChange={(e) => setSuspendPontualData(e.target.value)}
                    style={styles.modalInput}
                  />
                </label>
                <span style={styles.modalSubLabel}>Turno sem atendimento na UBS</span>
                <div style={styles.modalTipoSuspRow}>
                  {[
                    { v: "dia", l: "Dia inteiro" },
                    { v: "manha", l: "Manhã" },
                    { v: "tarde", l: "Tarde" },
                  ].map(({ v, l }) => (
                    <label key={v} style={styles.modalTipoSuspOpt}>
                      <input
                        type="radio"
                        name="suspendPontualEscopo"
                        checked={suspendPontualEscopo === v}
                        onChange={() => setSuspendPontualEscopo(v)}
                      />
                      <span>{l}</span>
                    </label>
                  ))}
                </div>
                <label style={styles.modalField}>
                  <span>Motivo (opcional) — visível para agentes e direção</span>
                  <textarea
                    value={suspendPontualMotivo}
                    onChange={(e) => setSuspendPontualMotivo(e.target.value)}
                    style={styles.modalTextarea}
                    rows={3}
                    maxLength={500}
                    placeholder="Ex.: Treinamento da equipe pela manhã"
                  />
                </label>
              </>
            )}

            {suspendModo === "periodo" && (
              <>
                <label style={styles.modalField}>
                  <span>Sem agendamento a partir de</span>
                  <input
                    type="date"
                    value={suspendFormDesde}
                    onChange={(e) => setSuspendFormDesde(e.target.value)}
                    style={styles.modalInput}
                  />
                </label>
                <label style={styles.modalCheck}>
                  <input
                    type="checkbox"
                    checked={suspendFormIndef}
                    onChange={(e) => setSuspendFormIndef(e.target.checked)}
                  />
                  <span>Prazo indeterminado (não sabemos quando o atendimento volta)</span>
                </label>
                {!suspendFormIndef && (
                  <label style={styles.modalField}>
                    <span>Último dia sem atendimento na UBS (opcional)</span>
                    <input
                      type="date"
                      value={suspendFormAte}
                      onChange={(e) => setSuspendFormAte(e.target.value)}
                      style={styles.modalInput}
                    />
                  </label>
                )}
              </>
            )}

            <div style={styles.modalFooter}>
              <button type="button" style={styles.modalBtnGhost} onClick={() => setModalSuspenderSpecKey(null)}>
                Cancelar
              </button>
              <button
                type="button"
                style={styles.modalBtnPrimary}
                onClick={() => {
                  if (suspendModo === "pontual") {
                    if (!suspendPontualData || !/^\d{4}-\d{2}-\d{2}$/.test(suspendPontualData)) {
                      window.alert("Selecione uma data válida.");
                      return;
                    }
                    if (!["dia", "manha", "tarde"].includes(suspendPontualEscopo)) return;
                    void Promise.resolve(
                      onSuspenderAtendimentoSpec(modalSuspenderSpecKey, {
                        modo: "pontual",
                        data: suspendPontualData,
                        escopo: suspendPontualEscopo,
                        motivo: suspendPontualMotivo.trim(),
                      })
                    ).then(() => setModalSuspenderSpecKey(null));
                    return;
                  }
                  if (!suspendFormDesde || !/^\d{4}-\d{2}-\d{2}$/.test(suspendFormDesde)) return;
                  if (!suspendFormIndef && suspendFormAte && suspendFormAte < suspendFormDesde) {
                    window.alert("A data fim não pode ser anterior à data de início da suspensão.");
                    return;
                  }
                  void Promise.resolve(
                    onSuspenderAtendimentoSpec(modalSuspenderSpecKey, {
                      modo: "periodo",
                      desde: suspendFormDesde,
                      indefinido: suspendFormIndef,
                      ate: suspendFormIndef ? undefined : suspendFormAte || undefined,
                    })
                  ).then(() => setModalSuspenderSpecKey(null));
                }}
              >
                Confirmar suspensão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children, sentenceTitle }) {
  return (
    <div style={styles.section}>
      <p
        style={{
          ...styles.sectionTitle,
          ...(sentenceTitle ? styles.sectionTitleSentence : {}),
          color: "#334155",
        }}
      >
        {title}
      </p>
      <div style={styles.grid}>{children}</div>
    </div>
  );
}

function MedicoBadge({ tipo }) {
  const m = tipo && MEDICO_TIPO[tipo];
  if (!m) return null;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 6px",
        borderRadius: 4,
        background: m.bg,
        color: m.color,
        marginLeft: 6,
      }}
    >
      {m.short}
    </span>
  );
}

/** Vista agente/direção: vagas disponíveis por turno (sessão). */
function AgenteTurnoRow({
  sess,
  isLast,
  specKey,
  dayKey,
  sessIdx,
  atendimentoDate,
  windowType,
  onSolicitar,
  solicitacaoEncaminhamentoObrigatorio,
  dentroJanelaSolicitacao = true,
  podeAgendarPrev = true,
  agendaQualquerDiaUtil = false,
  ocultarResumoVagas = false,
  usuarioUid = "",
  isDiretor = false,
}) {
  if (sess.visitaDomiciliarSemUnidade) {
    const rowStyle = {
      ...styles.agenteTurnoRow,
      ...(isLast ? { borderBottom: "none", paddingBottom: 0 } : {}),
    };
    return (
      <div style={rowStyle}>
        <p style={styles.sessLabel}>
          <SessaoLabelComDestaqueTurno label={sess.label} />
        </p>
        <div style={styles.agenteVisitaDomicLinha} role="status">
          <p style={styles.agenteVisitaDomicLinhaTitle}>Visitas domiciliares</p>
          <p style={styles.agenteVisitaDomicLinhaText}>
            Sem consultas odontológicas na UBS neste turno — o profissional está em{" "}
            <strong>visita domiciliar</strong> (todas as sextas-feiras à tarde).
          </p>
        </div>
      </div>
    );
  }

  const used = sess.used ?? 0;
  const reserved = sess.reserved ?? 0;
  const total = sess.total ?? 0;
  const livreBruto = Math.max(0, total - used - reserved);
  const rs = sess.reservaSolicitacao;
  const ativaReservaSolic = rs && reservaSolicitacaoAtiva(sess);
  const reservadaPorOutro =
    ativaReservaSolic && usuarioUid && rs.uid !== usuarioUid;
  const reservadaPorVoce =
    ativaReservaSolic && usuarioUid && rs.uid === usuarioUid;
  const livres = Math.max(0, livreBruto - (reservadaPorOutro ? 1 : 0));
  const encaixeExtra = sess.encaixeExtra ?? 0;
  const baseAgenda = Math.max(0, total - encaixeExtra);
  const ocupadas = used + reserved;
  /** Agente/direção: só exibe quantidade de vagas da agenda comum (sem encaixe). */
  const livresComuns =
    encaixeExtra > 0 ? Math.max(0, baseAgenda - ocupadas) : livres;
  /** Agenda fixa lotada; só sobraram vagas de encaixe (zona rural / agudos). */
  const somenteEncaixe =
    encaixeExtra > 0 && livres > 0 && ocupadas >= baseAgenda;
  const wl = sess.waitlistEnabled;
  const isFisio = specKey === "fisio";
  const isPsicologaListaEspera = specKey === "psicologa" && wl;
  /** Fisioterapia e sessões com lista de espera: solicitação pelo WhatsApp mesmo com agenda cheia. */
  const podeSolicitar =
    typeof onSolicitar === "function" &&
    dentroJanelaSolicitacao &&
    (windowType !== "prev" || podeAgendarPrev) &&
    (isFisio || wl || livres > 0) &&
    !reservadaPorOutro;
  /** Esconde o aviso “vagas esgotadas” quando ainda há fluxo de lista de espera (fisio ou psicologia). */
  const ocultarEsgotadoPorListaEspera =
    (isFisio || isPsicologaListaEspera) && livres === 0;

  const rowStyle = {
    ...styles.agenteTurnoRow,
    ...(isLast ? { borderBottom: "none", paddingBottom: 0 } : {}),
  };

  return (
    <div style={rowStyle}>
      <p style={styles.sessLabel}>
        <SessaoLabelComDestaqueTurno label={sess.label}>
          <MedicoBadge tipo={sess.medicoTipo} />
          {sess.pccuOnly && <span style={styles.pccuTag}>PCCU</span>}
        </SessaoLabelComDestaqueTurno>
      </p>
      {!ocultarResumoVagas && !ocultarEsgotadoPorListaEspera && (
        <p
          style={
            somenteEncaixe
              ? { ...styles.agenteDestaqueEncaixe, marginTop: 6 }
              : livresComuns > 0
                ? { ...styles.agenteDestaqueVagasLivres, marginTop: 6 }
                : {
                    ...styles.livresResumo,
                    marginTop: 6,
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#B91C1C",
                  }
          }
          role="status"
        >
          {somenteEncaixe ? (
            fraseVagasEsgotadasEncaixe({
              livres,
              medicoTipo: sess.medicoTipo,
              pccuOnly: sess.pccuOnly,
              specKey,
              sessLabel: sess.label,
            })
          ) : livresComuns > 0 ? (
            `${livresComuns} ${
              livresComuns === 1 ? "vaga disponível" : "vagas disponíveis"
            }`
          ) : (
            "Vagas esgotadas nesta data"
          )}
        </p>
      )}
      {isFisio && livres === 0 && (
        <p style={styles.agenteTurnoHintCheia}>
          A agenda está cheia. Solicite um agendamento para a lista de espera.
        </p>
      )}
      {isPsicologaListaEspera && livres === 0 && (
        <p style={styles.agenteTurnoHintCheia}>
          A agenda está cheia. Solicite um agendamento para a lista de espera.
        </p>
      )}
      {reservadaPorOutro && (
        <p style={styles.agenteReservaOutro} role="status">
          Última vaga reservada por <strong>{rs.nome}</strong> — solicitação em andamento. Aguarde ou
          escolha outro horário.
        </p>
      )}
      {reservadaPorVoce && (
        <p style={styles.agenteReservaVoce} role="status">
          Você reservou esta vaga ao abrir a solicitação.{" "}
          {somenteEncaixe && !isDiretor
            ? "Envie pelo WhatsApp à direção ou feche o formulário para liberar."
            : "Envie pelo WhatsApp ou feche o formulário para liberar."}
        </p>
      )}
      {podeSolicitar && (
        <button
          type="button"
          style={somenteEncaixe ? styles.btnSolicEncaixe : styles.btnSolicAgente}
          onClick={() =>
            onSolicitar({
              specKey,
              dayKey,
              sessIdx,
              sessLabel: sess.label,
              medicoTipo: sess.medicoTipo,
              pccuOnly: !!sess.pccuOnly,
              livresEncaixe: livres,
              atendimentoDate,
              solicitacaoEncaminhamentoObrigatorio,
              somenteEncaixe,
              coletaExamesRotina: !!sess.coletaExamesRotina,
              windowType,
              podeAgendarPrev,
              agendaQualquerDiaUtil,
            })
          }
        >
          {somenteEncaixe ? "Solicitar encaixe" : "Solicitar agendamento"}
        </button>
      )}
    </div>
  );
}

function RecepcaoBotoesAtendimentoEncerrado({
  spec,
  dataEncerrado,
  atendimentoEncerradoMap,
  agoraRecepcao,
  onToggleAtendimentoEncerrado,
}) {
  const map = atendimentoEncerradoMap || {};
  const base = `${spec.key}_${dataEncerrado}`;
  const hasM = specTemSessaoNoTurno(spec, "manha");
  const hasT = specTemSessaoNoTurno(spec, "tarde");

  const btnStyle = (ativo) =>
    ativo ? styles.btnAtendimentoEncerradoAtivo : styles.btnAtendimentoFinalizado;

  if (!hasM && !hasT) return null;

  const turnoRemover = (turnoLinha) => {
    const km = `${base}_manha`;
    const kt = `${base}_tarde`;
    if (hasM && hasT) return turnoLinha;
    if (hasM && !hasT) {
      if (map[km]) return "manha";
      if (map[base]) return undefined;
      return "manha";
    }
    if (!hasM && hasT) {
      if (map[kt]) return "tarde";
      if (map[base]) return undefined;
      return "tarde";
    }
    return undefined;
  };

  const turnoMarcar = (turnoLinha) => {
    if (hasM && hasT) return turnoLinha;
    if (hasM && !hasT) return "manha";
    if (!hasM && hasT) return "tarde";
    return undefined;
  };

  const botao = (turnoLinha, labelCurto, labelRemover) => {
    const km = `${base}_manha`;
    const kt = `${base}_tarde`;
    let ativo = false;
    if (hasM && hasT) {
      ativo = turnoLinha === "manha" ? !!map[km] : !!map[kt];
    } else if (hasM && !hasT) {
      ativo = !!(map[`${base}_manha`] || map[base]);
    } else if (!hasM && hasT) {
      ativo = !!(map[`${base}_tarde`] || map[base]);
    }
    const pode = recepcaoPodeMarcarAtendimentoFinalizado(spec, agoraRecepcao, turnoLinha);
    if (!ativo && !pode) return null;
    const textoFinal =
      !ativo && hasM && hasT
        ? `Atendimento finalizado — ${labelCurto}`
        : !ativo
          ? "Atendimento finalizado"
          : labelRemover;
    return (
      <button
        type="button"
        key={turnoLinha}
        style={btnStyle(ativo)}
        onClick={() =>
          onToggleAtendimentoEncerrado(
            spec.key,
            dataEncerrado,
            !ativo,
            ativo ? turnoRemover(turnoLinha) : turnoMarcar(turnoLinha)
          )
        }
      >
        {textoFinal}
      </button>
    );
  };

  if (hasM && hasT && map[base]) {
    return (
      <div style={styles.cardFooterRecepcao}>
        <button
          type="button"
          style={btnStyle(true)}
          onClick={() => onToggleAtendimentoEncerrado(spec.key, dataEncerrado, false)}
        >
          Remover aviso de atendimento encerrado
        </button>
      </div>
    );
  }

  if (hasM && hasT) {
    return (
      <div style={styles.cardFooterRecepcao}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {botao("manha", "manhã", "Remover aviso — manhã")}
          {botao("tarde", "tarde", "Remover aviso — tarde")}
        </div>
      </div>
    );
  }

  if (hasM && !hasT) {
    const el = botao("manha", "manhã", "Remover aviso de atendimento encerrado");
    if (!el) return null;
    return <div style={styles.cardFooterRecepcao}>{el}</div>;
  }

  const el = botao("tarde", "tarde", "Remover aviso de atendimento encerrado");
  if (!el) return null;
  return <div style={styles.cardFooterRecepcao}>{el}</div>;
}

function SpecCard({
  spec,
  profissionaisMap,
  isRecepcao,
  onSlotAction,
  onSolicitar,
  atendimentoEncerradoMap = {},
  onToggleAtendimentoEncerrado,
  mostrarBotaoEncerradoRecepcao = false,
  agoraRecepcao = new Date(),
  dentQuartaVisitaDomiciliarDesde = "",
  profissionalConfigPorSpec = {},
  usuarioUid = "",
  isDiretor = false,
}) {
  const windowType = spec.windowType;
  const dentroJanelaSolicitacao =
    isRecepcao || estaDentroJanelaSolicitacaoAgendamento(windowType, agoraRecepcao, spec.key);
  const msgForaJanelaAgente = isRecepcao
    ? ""
    : msgForaJanelaSolicitacaoAgendamento(windowType, spec.key);
  const foraDiaAgendamento =
    !isRecepcao && windowType === "prev" && spec.podeAgendarPrev === false;
  const msgForaDiaAgente = foraDiaAgendamento
    ? msgForaDiaAgendamentoPrev(spec, profissionalConfigPorSpec)
    : "";
  const meta = SPEC_META[spec.key] || { role: "", av: "?", bg: "#F1F5F9", tc: "#475569" };
  const name = nomeProfissionalFirestore(spec.key, profissionaisMap);
  const indicesSessoesUi = useMemo(() => {
    const v = indicesSessoesAtendimentoHojeVisiveis(spec, agoraRecepcao);
    if (v == null) return spec.sessions.map((_, i) => i);
    return v;
  }, [spec, agoraRecepcao]);
  const hasSome = useMemo(() => {
    const sessions = indicesSessoesUi.map((i) => spec.sessions[i]);
    if (sessions.some((s) => s.visitaDomiciliarSemUnidade)) return true;
    return sessions.some((s) => {
      if (s.waitlistEnabled) return true;
      const tot = s.total ?? 0;
      return (s.used ?? 0) + (s.reserved ?? 0) < tot;
    });
  }, [spec.sessions, indicesSessoesUi]);
  const visitaVariant = varianteVisitaDomiciliarNoCard({
    spec,
    todayStr: dataHojeIso(),
    desdeStr: dentQuartaVisitaDomiciliarDesde,
  });
  const isSame = spec.windowType === "same";
  const dataEncerrado =
    typeof spec.atendimentoDate === "string" && spec.atendimentoDate
      ? spec.atendimentoDate
      : "";

  return (
    <div
      style={{
        ...styles.card,
        border: isSame ? "1px solid #86EFAC" : "1px solid #E2E8F0",
        boxShadow: isSame
          ? "0 4px 14px rgba(22, 101, 52, 0.08)"
          : "0 2px 8px rgba(15, 23, 42, 0.06)",
        opacity: hasSome || visitaVariant ? 1 : 0.85,
      }}
    >
      <div style={{ ...styles.cardAccent, background: meta.bg }} aria-hidden />
      <div style={styles.cardBody}>
        <div style={styles.cardHeader}>
          <div style={{ ...styles.av, background: meta.bg, color: meta.tc }}>{meta.av}</div>
          <div style={styles.cardHeaderMain}>
            <p style={styles.cardName}>{name}</p>
            <p style={styles.cardRole}>{meta.role}</p>
            {!isSame && spec.agendaQualquerDiaUtil && (
              <p style={styles.cardAgendaLivre}>Agendamento em qualquer dia útil</p>
            )}
            <p style={styles.cardDate}>
              {spec.atendimentoDate ? formatDataCardAtendimento(spec.atendimentoDate) : "—"}
            </p>
          </div>
          <div style={styles.cardHeaderTags}>
            <span
              style={{
                ...styles.winTag,
                background: isSame ? "#DCFCE7" : "#EFF6FF",
                color: isSame ? "#166534" : "#1D4ED8",
                border: `1px solid ${isSame ? "#86EFAC" : "#BFDBFE"}`,
              }}
            >
              {isSame ? "Atend. hoje" : DAY_LABEL[spec.atendimentoDia]?.split("-")[0] || "Agenda"}
            </span>
            {!hasSome && visitaVariant && (
              <span style={styles.fullBadgeVisita}>Visitas domiciliares</span>
            )}
            {!hasSome && !visitaVariant && <span style={styles.fullBadge}>Esgotado</span>}
          </div>
        </div>

        {!isRecepcao && !dentroJanelaSolicitacao && msgForaJanelaAgente ? (
          <p style={styles.agenteCardForaJanela} role="status">
            {msgForaJanelaAgente}
          </p>
        ) : null}
        {!isRecepcao && foraDiaAgendamento && msgForaDiaAgente ? (
          <p style={styles.agenteCardForaDia} role="status">
            {msgForaDiaAgente}
          </p>
        ) : null}

        {!isRecepcao && (
          <div style={styles.cardResumoAgente}>
            {indicesSessoesUi.map((sessIdx, arrIdx) => (
              <AgenteTurnoRow
                key={sessIdx}
                sess={spec.sessions[sessIdx]}
                isLast={arrIdx === indicesSessoesUi.length - 1}
                specKey={spec.key}
                dayKey={spec.atendimentoDia}
                sessIdx={sessIdx}
                atendimentoDate={spec.atendimentoDate}
                windowType={windowType}
                onSolicitar={onSolicitar}
                solicitacaoEncaminhamentoObrigatorio={spec.solicitacaoEncaminhamentoObrigatorio}
                dentroJanelaSolicitacao={dentroJanelaSolicitacao}
                podeAgendarPrev={spec.podeAgendarPrev !== false}
                agendaQualquerDiaUtil={!!spec.agendaQualquerDiaUtil}
                ocultarResumoVagas={!!visitaVariant}
                usuarioUid={usuarioUid}
                isDiretor={isDiretor}
              />
            ))}
          </div>
        )}

        {isRecepcao &&
          indicesSessoesUi.map((sessIdx) => {
            const sess = spec.sessions[sessIdx];
            return (
              <SessionRow
                key={sess.vagaId ?? `${spec.key}_${spec.atendimentoDate}_${sessIdx}`}
                sess={sess}
                sessIdx={sessIdx}
                specKey={spec.key}
                dayKey={spec.atendimentoDia}
                atendimentoDate={spec.atendimentoDate}
                isRecepcao
                onSlotAction={onSlotAction}
                somenteRotuloTurno={!!visitaVariant}
              />
            );
          })}

        {isRecepcao &&
          !visitaVariant &&
          mostrarBotaoEncerradoRecepcao &&
          dataEncerrado &&
          typeof onToggleAtendimentoEncerrado === "function" && (
            <RecepcaoBotoesAtendimentoEncerrado
              spec={spec}
              dataEncerrado={dataEncerrado}
              atendimentoEncerradoMap={atendimentoEncerradoMap}
              agoraRecepcao={agoraRecepcao}
              onToggleAtendimentoEncerrado={onToggleAtendimentoEncerrado}
            />
          )}
      </div>
    </div>
  );
}

function reservaSolicitacaoPropsIguais(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const ma = typeof a.criadoEm?.toMillis === "function" ? a.criadoEm.toMillis() : 0;
  const mb = typeof b.criadoEm?.toMillis === "function" ? b.criadoEm.toMillis() : 0;
  return a.uid === b.uid && a.nome === b.nome && ma === mb;
}

function sessionRowPropsIguais(prev, next) {
  if (prev.sessIdx !== next.sessIdx) return false;
  if (prev.specKey !== next.specKey) return false;
  if (prev.dayKey !== next.dayKey) return false;
  if (prev.atendimentoDate !== next.atendimentoDate) return false;
  if (prev.isRecepcao !== next.isRecepcao) return false;
  if (prev.somenteRotuloTurno !== next.somenteRotuloTurno) return false;
  if (prev.onSlotAction !== next.onSlotAction) return false;

  const ps = prev.sess;
  const ns = next.sess;
  if ((ps?.vagaId ?? "") !== (ns?.vagaId ?? "")) return false;
  if ((Number(ps?.used) || 0) !== (Number(ns?.used) || 0)) return false;
  if ((Number(ps?.reserved) || 0) !== (Number(ns?.reserved) || 0)) return false;
  if ((ps?.total ?? 0) !== (ns?.total ?? 0)) return false;
  if ((ps?.encaixeExtra ?? 0) !== (ns?.encaixeExtra ?? 0)) return false;
  if ((ps?.label ?? "") !== (ns?.label ?? "")) return false;
  if (!!ps?.waitlistEnabled !== !!ns?.waitlistEnabled) return false;
  if ((ps?.medicoTipo ?? "") !== (ns?.medicoTipo ?? "")) return false;
  if (!!ps?.pccuOnly !== !!ns?.pccuOnly) return false;
  if (!!ps?.visitaDomiciliarSemUnidade !== !!ns?.visitaDomiciliarSemUnidade) return false;
  return reservaSolicitacaoPropsIguais(ps?.reservaSolicitacao, ns?.reservaSolicitacao);
}

const SessionRow = memo(function SessionRow({
  sess,
  sessIdx,
  specKey,
  dayKey,
  atendimentoDate,
  isRecepcao,
  onSlotAction,
  somenteRotuloTurno = false,
}) {
  if (sess.visitaDomiciliarSemUnidade) {
    return (
      <div style={styles.sessRow}>
        <div style={{ width: "100%", minWidth: 0 }}>
          <p style={styles.sessLabel}>
            <SessaoLabelComDestaqueTurno label={sess.label} />
          </p>
          <div style={styles.agenteVisitaDomicLinha} role="status">
            <p style={styles.agenteVisitaDomicLinhaTitle}>Visitas domiciliares</p>
            <p style={styles.agenteVisitaDomicLinhaText}>
              Sem vagas na UBS neste turno — profissional em visita domiciliar (sexta à tarde).
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (somenteRotuloTurno) {
    return (
      <div style={styles.sessRowSomenteTurno}>
        <p style={styles.sessLabel}>
          <SessaoLabelComDestaqueTurno label={sess.label}>
            <MedicoBadge tipo={sess.medicoTipo} />
            {sess.pccuOnly && <span style={styles.pccuTag}>PCCU</span>}
          </SessaoLabelComDestaqueTurno>
        </p>
      </div>
    );
  }

  const used = Number(sess.used) || 0;
  const reserved = Number(sess.reserved) || 0;
  const total = Number(sess.total) || 0;
  const livreBruto = Math.max(0, total - used - reserved);
  const bloqSolic = !isRecepcao && reservaSolicitacaoAtiva(sess) ? 1 : 0;
  const livres = Math.max(0, livreBruto - bloqSolic);
  const filled = used + reserved;
  const encaixeExtra = sess.encaixeExtra ?? 0;
  const baseAgenda = Math.max(0, total - encaixeExtra);
  /** Com encaixe: só mostra vagas comuns até lotar; depois só encaixe. */
  const temEncaixe = encaixeExtra > 0;
  const faseComuns = temEncaixe && filled < baseAgenda;
  const faseEncaixe = temEncaixe && filled >= baseAgenda && filled < total;
  const agendaCheia = filled >= total;

  let livresRecepcao = livres;
  let textoPill = "";
  /** Barra única (sem encaixe ou só encaixe sem agenda base). */
  let pctUnica = 0;
  /** Duas barras: comuns cheias → 100%; depois barra só para encaixe. */
  let pctComuns = 0;
  let pctEncaixe = 0;
  let mostrarBarraEncaixe = false;

  if (temEncaixe) {
    if (faseComuns) {
      livresRecepcao = baseAgenda - filled;
      textoPill = `${livresRecepcao}/${baseAgenda} livres (comuns)`;
      if (baseAgenda > 0) {
        pctComuns = Math.min(100, Math.round((filled / baseAgenda) * 100));
      } else {
        pctUnica = encaixeExtra
          ? Math.min(100, Math.round((filled / encaixeExtra) * 100))
          : 0;
      }
    } else if (!agendaCheia) {
      livresRecepcao = total - filled;
      textoPill = `${livresRecepcao}/${encaixeExtra} encaixe(s) livre(s)`;
      if (baseAgenda > 0) {
        pctComuns = 100;
        const usoEncaixe = Math.max(0, filled - baseAgenda);
        pctEncaixe = encaixeExtra
          ? Math.min(100, Math.round((usoEncaixe / encaixeExtra) * 100))
          : 0;
        mostrarBarraEncaixe = encaixeExtra > 0;
      } else {
        pctUnica = encaixeExtra
          ? Math.min(100, Math.round((filled / encaixeExtra) * 100))
          : 0;
      }
    } else {
      livresRecepcao = 0;
      textoPill = `0/${total} livres`;
      if (baseAgenda > 0) {
        pctComuns = 100;
        pctEncaixe = 100;
        mostrarBarraEncaixe = encaixeExtra > 0;
      } else {
        pctUnica = 100;
      }
    }
  } else {
    textoPill = `${livres}/${total} livres`;
    pctUnica = total ? Math.min(100, Math.round((filled / total) * 100)) : 0;
  }

  const cheio = livres <= 0;
  const barFillUnica = cheio
    ? "#22C55E"
    : filled === 0
      ? "#22C55E"
      : faseEncaixe
        ? "#EA580C"
        : "#3B82F6";

  const podeConfirmarReserva = reserved > 0 && used < total && livres <= 0;
  const podeAdd =
    podePreencherVaga(reserved, used, total, livres) &&
    (livresRecepcao > 0 || podeConfirmarReserva);
  const liberarEncaixe = temEncaixe && filled > baseAgenda;

  return (
    <div style={styles.sessRow}>
      <div style={{ width: "100%", minWidth: 0 }}>
        <div style={styles.sessTitleRow}>
          <p style={styles.sessLabel}>
            <SessaoLabelComDestaqueTurno label={sess.label}>
              <MedicoBadge tipo={sess.medicoTipo} />
              {sess.pccuOnly && <span style={styles.pccuTag}>PCCU</span>}
            </SessaoLabelComDestaqueTurno>
          </p>
          <span
            style={{
              ...styles.ratioPill,
              color: cheio ? "#15803D" : livresRecepcao > 0 ? "#166534" : "#991B1B",
            }}
          >
            {textoPill}
          </span>
        </div>
        {temEncaixe && baseAgenda > 0 ? (
          <div style={styles.barrasRecepcaoStack} aria-hidden>
            {mostrarBarraEncaixe && <p style={styles.barRecepcaoLegenda}>Agenda comum</p>}
            <div
              style={{
                ...styles.barTrackRecepcao,
                ...(cheio ? styles.barTrackCheio : {}),
              }}
            >
              <div
                style={{
                  ...styles.barFill,
                  width: `${pctComuns}%`,
                  background: pctComuns >= 100 ? "#22C55E" : "#3B82F6",
                }}
              />
            </div>
            {mostrarBarraEncaixe && (
              <>
                <p style={styles.barRecepcaoLegendaEncaixe}>Encaixe</p>
                <div
                  style={{
                    ...styles.barTrackRecepcao,
                    ...(cheio ? styles.barTrackCheio : {}),
                  }}
                >
                  <div
                    style={{
                      ...styles.barFill,
                      width: `${pctEncaixe}%`,
                      background: pctEncaixe >= 100 ? "#22C55E" : "#EA580C",
                    }}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <div
            style={{
              ...styles.barTrack,
              ...(cheio ? styles.barTrackCheio : {}),
            }}
            aria-hidden
          >
            <div
              style={{
                ...styles.barFill,
                width: `${pctUnica}%`,
                background: barFillUnica,
              }}
            />
          </div>
        )}
        <div style={styles.statsRow}>
          <span>
            <strong style={{ color: "#166534" }}>{livresRecepcao}</strong>{" "}
            {temEncaixe ? (faseEncaixe ? "encaixe(s) livre(s)" : "livre(s) (comuns)") : "livre(s)"}
          </span>
          <span>
            <strong style={{ color: "#C2410C" }}>{reserved}</strong> reserva(s)
          </span>
        </div>
      </div>
      <div style={styles.sessActions}>
        <div style={styles.recepPair} role="group" aria-label="Ajustar vagas preenchidas">
          <button
            type="button"
            style={liberarEncaixe ? styles.btnRecepRemoveEncaixe : styles.btnRecepRemove}
            disabled={reserved <= 0 && used <= 0}
            title={
              reserved > 0
                ? "Remover uma reserva pendente"
                : liberarEncaixe
                  ? "Cancelar agendamento de encaixe"
                  : used > 0
                    ? "Cancelar agendamento (vaga comum)"
                    : ""
            }
            onClick={() =>
              liberarVaga({
                vagaId: sess.vagaId,
                specKey,
                dayKey,
                sessIdx,
                atendimentoDate,
                reserved,
                used,
                onSlotAction,
              })
            }
          >
            {liberarEncaixe ? "− Liberar encaixe" : "− Liberar"}
          </button>
          <button
            type="button"
            style={faseEncaixe ? styles.btnRecepAddEncaixe : styles.btnRecepAdd}
            disabled={!podeAdd}
            title={
              livresRecepcao > 0 && livres > 0
                ? faseEncaixe
                  ? "Registrar agendamento de encaixe"
                  : "Registrar agendamento (vaga comum)"
                : reserved > 0 && used < total
                  ? "Confirmar reserva pendente como agendamento"
                  : ""
            }
            onClick={() =>
              preencherVaga({
                vagaId: sess.vagaId,
                specKey,
                dayKey,
                sessIdx,
                atendimentoDate,
                reserved,
                used,
                total,
                livres,
                onSlotAction,
              })
            }
          >
            {faseEncaixe ? "+ Preencher encaixe" : "+ Preencher"}
          </button>
        </div>
      </div>
    </div>
  );
}, sessionRowPropsIguais);

function LegendItem({ color, border, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748B" }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          background: color,
          border: `1px solid ${border}`,
          display: "inline-block",
        }}
      />
      {label}
    </div>
  );
}

const styles = {
  wrap: { maxWidth: 1200, margin: "0 auto" },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalBoxSuspender: { maxWidth: 480 },
  modalBox: {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    borderRadius: 14,
    padding: "20px 22px",
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.2)",
    border: "1px solid #E2E8F0",
  },
  modalTitle: { margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#0F172A" },
  modalLead: { margin: "0 0 16px", fontSize: 14, color: "#475569", lineHeight: 1.45 },
  modalHint: { margin: "0 0 10px", fontSize: 13, color: "#64748B", lineHeight: 1.4 },
  modalSubLabel: {
    display: "block",
    margin: "0 0 8px",
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
  },
  modalTipoSuspRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px 18px",
    marginBottom: 14,
  },
  modalTipoSuspOpt: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: "#334155",
    cursor: "pointer",
  },
  modalTextarea: {
    width: "100%",
    minHeight: 72,
    padding: "10px 12px",
    fontSize: 14,
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    fontFamily: "inherit",
    resize: "vertical",
    boxSizing: "border-box",
  },
  modalField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 14,
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
  },
  modalInput: {
    padding: "10px 12px",
    fontSize: 15,
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    fontFamily: "inherit",
  },
  modalCheck: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
    fontSize: 14,
    color: "#334155",
    lineHeight: 1.4,
    cursor: "pointer",
  },
  modalChecksCol: { marginBottom: 8 },
  modalDiaTurnoBlock: {
    marginBottom: 14,
    paddingBottom: 12,
    borderBottom: "1px solid #F1F5F9",
  },
  modalTurnosInline: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px 20px",
    marginLeft: 28,
    marginTop: 8,
  },
  modalCheckTurno: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "#475569",
    cursor: "pointer",
  },
  modalFooter: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 18,
    paddingTop: 14,
    borderTop: "1px solid #F1F5F9",
  },
  modalBtnGhost: {
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    background: "#fff",
    color: "#475569",
    cursor: "pointer",
  },
  modalBtnPrimary: {
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 8,
    border: "none",
    background: "#0C447C",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(12, 68, 124, 0.25)",
  },
  painelSuspenderAcesso: {
    marginTop: 22,
    padding: "16px 18px",
    borderRadius: 12,
    border: "1px solid #FDBA74",
    background: "linear-gradient(180deg, #FFFBEB 0%, #FEF3C7 100%)",
  },
  painelSuspenderAcessoHint: {
    margin: "0 0 14px",
    fontSize: 13,
    color: "#78716C",
    lineHeight: 1.45,
  },
  painelSuspenderAcessoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
    gap: 10,
  },
  painelSuspenderAcessoItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 10,
    background: "#fff",
    border: "1px solid #FDE68A",
  },
  painelSuspenderAcessoInfo: { display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 },
  painelSuspenderAcessoAv: {
    width: 36,
    height: 36,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 800,
    flexShrink: 0,
  },
  painelSuspenderAcessoNome: { margin: 0, fontSize: 14, fontWeight: 700, color: "#0F172A" },
  painelSuspenderAcessoRole: { margin: "2px 0 0", fontSize: 12, color: "#64748B" },
  painelSuspenderAcessoBadge: {
    margin: "4px 0 0",
    fontSize: 11,
    fontWeight: 600,
    color: "#C2410C",
  },
  btnSuspenderAcessoItem: {
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 8,
    border: "1px solid #F97316",
    background: "#FFF7ED",
    color: "#9A3412",
    cursor: "pointer",
    flexShrink: 0,
  },
  painelSuspRecepcao: {
    marginBottom: 22,
    padding: "16px 18px",
    borderRadius: 12,
    border: "1px solid #FECACA",
    background: "linear-gradient(180deg, #FFF7ED 0%, #FFEDD5 100%)",
  },
  painelSuspRecepcaoTitle: {
    margin: "0 0 12px",
    fontSize: 14,
    fontWeight: 700,
    color: "#9A3412",
  },
  painelSuspRecepcaoGrid: { display: "flex", flexDirection: "column", gap: 12 },
  painelSuspPontualRecepcao: {
    marginBottom: 22,
    padding: "16px 18px",
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
  },
  painelSuspCardPontual: {
    padding: "12px 14px",
    borderRadius: 10,
    background: "#fff",
    border: "1px solid #E2E8F0",
  },
  btnRemoverSuspPontual: {
    marginTop: 8,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: "1px solid #94A3B8",
    background: "#fff",
    color: "#475569",
    cursor: "pointer",
  },
  painelSuspCard: {
    padding: "12px 14px",
    borderRadius: 10,
    background: "#fff",
    border: "1px solid #FDBA74",
  },
  painelSuspCardNome: { margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#0F172A" },
  painelSuspCardMeta: { fontWeight: 500, color: "#64748B", fontSize: 13 },
  painelSuspCardDetalhe: { margin: "0 0 10px", fontSize: 13, color: "#57534E", lineHeight: 1.45 },
  btnReativarSusp: {
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 8,
    border: "none",
    background: "#C2410C",
    color: "#fff",
    cursor: "pointer",
  },
  empty: { textAlign: "center", padding: "48px 20px" },
  legend: {
    display: "flex",
    gap: 16,
    marginBottom: 20,
    flexWrap: "wrap",
    padding: "12px 16px",
    background: "#F8FAFC",
    borderRadius: 12,
    border: "1px solid #E2E8F0",
  },
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    margin: "0 0 14px",
    paddingBottom: 8,
    borderBottom: "2px solid #E2E8F0",
  },
  /** Título em frase (agendamento disponível); sem caixa alta forçada. */
  sectionTitleSentence: {
    textTransform: "none",
    letterSpacing: "normal",
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1.45,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
    gap: 16,
    alignItems: "stretch",
  },
  card: {
    background: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  cardAccent: { height: 4, width: "100%", flexShrink: 0 },
  cardBody: { padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 0, flex: 1 },
  cardFooterRecepcao: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid #EEF2F7",
  },
  btnAtendimentoFinalizado: {
    width: "100%",
    padding: "11px 14px",
    fontSize: 13,
    fontWeight: 700,
    border: "1px solid #0C447C",
    borderRadius: 8,
    cursor: "pointer",
    background: "linear-gradient(180deg, #0C447C 0%, #082F56 100%)",
    color: "#fff",
    boxShadow: "0 2px 8px rgba(12, 68, 124, 0.35)",
    lineHeight: 1.3,
  },
  btnAtendimentoEncerradoAtivo: {
    width: "100%",
    padding: "11px 14px",
    fontSize: 13,
    fontWeight: 700,
    border: "1px solid #94A3B8",
    borderRadius: 8,
    cursor: "pointer",
    background: "#F1F5F9",
    color: "#475569",
    boxShadow: "none",
    lineHeight: 1.3,
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
    flexWrap: "nowrap",
  },
  cardHeaderMain: { flex: 1, minWidth: 0 },
  cardHeaderTags: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
    flexShrink: 0,
  },
  av: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
    boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
  },
  cardName: { fontSize: 15, fontWeight: 700, color: "#0F172A", margin: "0 0 2px", lineHeight: 1.25 },
  cardRole: { fontSize: 12, color: "#64748B", margin: 0, fontWeight: 500 },
  cardAgendaLivre: { fontSize: 11, color: "#047857", margin: "4px 0 0", fontWeight: 600 },
  cardDate: { fontSize: 12, color: "#0369A1", margin: "6px 0 0", fontWeight: 500 },
  winTag: { fontSize: 11, padding: "4px 10px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" },
  fullBadge: {
    fontSize: 10,
    background: "#FEE2E2",
    color: "#991B1B",
    padding: "4px 8px",
    borderRadius: 999,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  fullBadgeVisita: {
    fontSize: 10,
    background: "#CCFBF1",
    color: "#0F766E",
    padding: "4px 8px",
    borderRadius: 999,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  /** Aviso compacto no resumo agente/direção (ex.: sexta tarde Dr. Patrick — visitas). */
  agenteVisitaDomicLinha: {
    marginTop: 6,
    padding: "8px 10px",
    borderRadius: 8,
    background: "linear-gradient(135deg, #F0FDFA 0%, #ECFEFF 100%)",
    border: "1px solid #99F6E4",
  },
  agenteVisitaDomicLinhaTitle: {
    margin: "0 0 4px",
    fontSize: 12,
    fontWeight: 700,
    color: "#0F766E",
    lineHeight: 1.3,
  },
  agenteVisitaDomicLinhaText: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.45,
    color: "#134E4A",
  },
  sessRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 12,
    padding: "12px 12px",
    background: "#F8FAFC",
    borderRadius: 10,
    marginBottom: 8,
    border: "1px solid #EEF2F7",
  },
  sessRowSomenteTurno: {
    padding: "8px 12px",
    marginBottom: 8,
    background: "#F8FAFC",
    borderRadius: 10,
    border: "1px solid #EEF2F7",
  },
  sessTitleRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "8px 12px",
    marginBottom: 8,
    rowGap: 8,
  },
  sessLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
    margin: 0,
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    lineHeight: 1.35,
    minWidth: 0,
    flex: "1 1 140px",
  },
  ratioPill: {
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 6,
    background: "#F1F5F9",
    flexShrink: 0,
    maxWidth: "100%",
    textAlign: "right",
    boxSizing: "border-box",
  },
  barTrack: {
    height: 6,
    borderRadius: 999,
    background: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 8,
  },
  /** Faixa sem margem inferior (empilhada em `barrasRecepcaoStack`). */
  barTrackRecepcao: {
    height: 6,
    borderRadius: 999,
    background: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 0,
  },
  barrasRecepcaoStack: {
    marginBottom: 8,
  },
  barRecepcaoLegenda: {
    margin: "0 0 4px",
    fontSize: 10,
    fontWeight: 600,
    color: "#64748B",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
  },
  barRecepcaoLegendaEncaixe: {
    margin: "10px 0 4px",
    fontSize: 10,
    fontWeight: 600,
    color: "#9A3412",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
  },
  barTrackCheio: {
    background: "#DCFCE7",
    boxShadow: "inset 0 0 0 1px #86EFAC",
  },
  barFill: { height: "100%", borderRadius: 999 },
  livresResumo: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.35,
  },
  /** Agente/direção: destaque para “X vagas disponíveis”. */
  agenteDestaqueVagasLivres: {
    margin: 0,
    padding: "7px 10px",
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.35,
    letterSpacing: "-0.01em",
    color: "#065F46",
    background: "linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 55%, #6EE7B7 100%)",
    border: "1px solid #059669",
    borderRadius: 8,
    boxShadow: "0 2px 8px rgba(5, 150, 105, 0.2), inset 0 1px 0 rgba(255,255,255,0.5)",
  },
  /** Agente/direção: destaque para vagas só de encaixe disponíveis. */
  agenteDestaqueEncaixe: {
    margin: 0,
    padding: "7px 10px",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.4,
    color: "#7C2D12",
    background: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 50%, #FDE68A 100%)",
    border: "1px solid #D97706",
    borderRadius: 8,
    boxShadow: "0 2px 8px rgba(217, 119, 6, 0.16), inset 0 1px 0 rgba(255,255,255,0.6)",
  },
  agenteCardForaJanela: {
    margin: "0 16px 0",
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.45,
    color: "#B45309",
    background: "#FFFBEB",
    border: "1px solid #FCD34D",
    borderRadius: 8,
  },
  agenteCardForaDia: {
    margin: "8px 16px 0",
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.45,
    color: "#1D4ED8",
    background: "#EFF6FF",
    border: "1px solid #BFDBFE",
    borderRadius: 8,
  },
  cardResumoAgente: {
    padding: "12px 16px 16px",
    borderTop: "1px solid #F1F5F9",
  },
  agenteTurnoRow: {
    padding: "12px 0",
    borderBottom: "1px solid #F1F5F9",
  },
  agenteTurnoHint: {
    margin: "6px 0 0",
    fontSize: 12,
    fontWeight: 600,
    color: "#D97706",
  },
  agenteTurnoHintCheia: {
    margin: "6px 0 0",
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.35,
    color: "#B91C1C",
  },
  agenteReservaOutro: {
    margin: "8px 0 0",
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.4,
    color: "#92400E",
    background: "#FFFBEB",
    border: "1px solid #FCD34D",
    borderRadius: 8,
  },
  agenteReservaVoce: {
    margin: "8px 0 0",
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.4,
    color: "#1E40AF",
    background: "#EFF6FF",
    border: "1px solid #93C5FD",
    borderRadius: 8,
  },
  statsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px 14px",
    fontSize: 11,
    color: "#64748B",
  },
  sessActions: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
    minWidth: 0,
    flexShrink: 0,
  },
  recepPair: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
    minWidth: 0,
  },
  btnRecepAdd: {
    flex: 1,
    minWidth: 0,
    padding: "10px 8px",
    fontSize: 13,
    fontWeight: 700,
    border: "1px solid #86EFAC",
    borderRadius: 8,
    cursor: "pointer",
    background: "linear-gradient(180deg, #F0FDF4 0%, #DCFCE7 100%)",
    color: "#14532D",
    lineHeight: 1.2,
    textAlign: "center",
    boxShadow: "0 1px 2px rgba(22, 101, 52, 0.12)",
  },
  btnRecepRemove: {
    flex: 1,
    minWidth: 0,
    padding: "10px 8px",
    fontSize: 13,
    fontWeight: 700,
    border: "1px solid #FECACA",
    borderRadius: 8,
    cursor: "pointer",
    background: "linear-gradient(180deg, #FEF2F2 0%, #FEE2E2 100%)",
    color: "#991B1B",
    lineHeight: 1.2,
    textAlign: "center",
    boxShadow: "0 1px 2px rgba(153, 27, 27, 0.1)",
  },
  btnRecepAddEncaixe: {
    flex: 1,
    minWidth: 0,
    padding: "10px 8px",
    fontSize: 13,
    fontWeight: 800,
    border: "2px solid #C2410C",
    borderRadius: 8,
    cursor: "pointer",
    background: "linear-gradient(180deg, #FB923C 0%, #EA580C 100%)",
    color: "#FFFBEB",
    lineHeight: 1.2,
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(234, 88, 12, 0.45)",
  },
  btnRecepRemoveEncaixe: {
    flex: 1,
    minWidth: 0,
    padding: "10px 8px",
    fontSize: 13,
    fontWeight: 800,
    border: "2px solid #6D28D9",
    borderRadius: 8,
    cursor: "pointer",
    background: "linear-gradient(180deg, #A78BFA 0%, #7C3AED 100%)",
    color: "#FAF5FF",
    lineHeight: 1.2,
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(124, 58, 237, 0.4)",
  },
  waitlistHint: { fontSize: 11, color: "#D97706", margin: "6px 0 0", fontWeight: 500 },
  pccuTag: {
    fontSize: 9,
    fontWeight: 700,
    marginLeft: 4,
    padding: "2px 6px",
    borderRadius: 4,
    background: "#EDE9FE",
    color: "#5B21B6",
  },
  btnEspera: {
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid #FCD34D",
    borderRadius: 8,
    cursor: "pointer",
    background: "#FFFBEB",
    color: "#B45309",
    alignSelf: "flex-start",
    whiteSpace: "nowrap",
  },
  btnSolic: {
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 600,
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#0C447C",
    color: "#fff",
    boxShadow: "0 1px 2px rgba(12, 68, 124, 0.25)",
  },
  btnSolicAgente: {
    marginTop: 10,
    width: "100%",
    padding: "10px 14px",
    fontSize: 12,
    fontWeight: 600,
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#0C447C",
    color: "#fff",
    boxShadow: "0 1px 2px rgba(12, 68, 124, 0.25)",
  },
  btnSolicEncaixe: {
    marginTop: 10,
    width: "100%",
    padding: "10px 14px",
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid #B91C1C",
    borderRadius: 8,
    cursor: "pointer",
    background: "linear-gradient(180deg, #EF4444 0%, #DC2626 100%)",
    color: "#fff",
    boxShadow: "0 2px 6px rgba(185, 28, 28, 0.35)",
  },
};

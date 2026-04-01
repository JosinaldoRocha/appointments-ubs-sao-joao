// src/components/TabVagas.jsx
import { useMemo, useState, useEffect } from "react";
import {
  SPEC_META,
  DAY_LABEL,
  MEDICO_TIPO,
  DEFAULT_PROF_NAMES,
  toDateStr,
  recepcaoPodeMarcarAtendimentoFinalizado,
} from "../services/scheduleConfig";
import { atendimentoEncerradoKey } from "../services/db";
import { fraseVagasEsgotadasEncaixe } from "../services/whatsappSolicitacao";

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
    onSlotAction({ specKey, dayKey, sessIdx, atendimentoDate, action: "incOcupada" });
    return;
  }
  if (reserved > 0 && used < total) {
    onSlotAction({ specKey, dayKey, sessIdx, atendimentoDate, action: "confirmarReserva" });
  }
}

function liberarVaga({ specKey, dayKey, sessIdx, atendimentoDate, reserved, used, onSlotAction }) {
  if (reserved > 0) {
    onSlotAction({ specKey, dayKey, sessIdx, atendimentoDate, action: "decReserva" });
  } else if (used > 0) {
    onSlotAction({ specKey, dayKey, sessIdx, atendimentoDate, action: "decOcupada" });
  }
}

/**
 * Recepção: botão no card de atendimento hoje — marcar só no turno atual; remover aviso em qualquer
 * horário do mesmo dia (para não bloquear após o turno).
 */
function recepcaoMostrarBotaoEncerrado(spec, atendimentoEncerradoMap, agora, onToggle) {
  if (typeof onToggle !== "function" || spec.windowType !== "same") return false;
  const hoje = toDateStr(agora);
  if (spec.atendimentoDate !== hoje) return false;
  const k = atendimentoEncerradoKey(spec.key, spec.atendimentoDate);
  if (atendimentoEncerradoMap[k]) return true;
  return recepcaoPodeMarcarAtendimentoFinalizado(spec, agora);
}

/** Há vaga livre na agenda ou sessão com solicitação por WhatsApp (ex.: fisioterapia). */
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

export default function TabVagas({
  specs,
  profissionaisMap = {},
  isRecepcao,
  onSlotAction,
  onSolicitar,
  atendimentoEncerradoMap = {},
  onToggleAtendimentoEncerrado,
}) {
  const [agoraRecepcao, setAgoraRecepcao] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgoraRecepcao(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const specsLista = useMemo(() => {
    if (isRecepcao) return specs;
    const map = atendimentoEncerradoMap || {};
    return specs.filter((s) => {
      const d = s.atendimentoDate;
      if (typeof d !== "string" || !d) return true;
      const k = atendimentoEncerradoKey(s.key, d);
      return !map[k];
    });
  }, [specs, atendimentoEncerradoMap, isRecepcao]);

  const prev = specsLista.filter((s) => s.windowType === "prev");
  const same = specsLista.filter((s) => s.windowType === "same");
  const prevPorDia = agruparPrevPorDia(prev);
  const prevSecoes = secoesPrevOrdenadasPorData(prevPorDia);
  const semVagasLivres = specsLista.length > 0 && !hasAnyVacancy(specsLista);

  if (specs.length === 0) {
    return (
      <div style={styles.empty}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>
          Nenhum agendamento disponível hoje
        </p>
        <p style={{ fontSize: 13, color: "#64748B" }}>
          Em geral, o agendamento abre no último dia útil anterior ao atendimento (feriados são
          considerados). Nutrição, fisioterapia e psicologia permitem agendar em qualquer dia útil (conforme o card).
        </p>
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
          Os atendimentos de hoje marcados como encerrados pela recepção ficam ocultos aqui. Quando a
          recepção remover o aviso, os cartões voltam a aparecer.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      {!isRecepcao && semVagasLivres && (
        <div style={styles.alertSemVagas} role="status">
          <p style={styles.alertSemVagasTitle}>Não há mais vagas disponíveis</p>
          <p style={styles.alertSemVagasText}>
            Todas as vagas de agenda estão preenchidas no momento. Acompanhe novas aberturas pela
            equipe ou pela recepção.
          </p>
        </div>
      )}

      {isRecepcao && (
        <div style={styles.legend}>
          <LegendItem color="#DBEAFE" border="#93C5FD" label="Agenda: dia útil anterior ao atendimento" />
          <LegendItem
            color="#ECFDF5"
            border="#6EE7B7"
            label="Nutrição, fisioterapia e psicologia: agendamento em qualquer dia útil (dia de atendimento no card)"
          />
          <LegendItem color="#DCFCE7" border="#86EFAC" label="Atendimento hoje — vagas sobrando" />
          <LegendItem
            color="#FFFBEB"
            border="#FCD34D"
            label="Cada turno: +2 vagas de encaixe além da agenda (exceto fisioterapia)"
          />
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
              atendimentoEncerradoMap={atendimentoEncerradoMap}
              onToggleAtendimentoEncerrado={onToggleAtendimentoEncerrado}
              mostrarBotaoEncerradoRecepcao={recepcaoMostrarBotaoEncerrado(
                spec,
                atendimentoEncerradoMap,
                agoraRecepcao,
                onToggleAtendimentoEncerrado
              )}
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
              atendimentoEncerradoMap={atendimentoEncerradoMap}
              onToggleAtendimentoEncerrado={onToggleAtendimentoEncerrado}
              mostrarBotaoEncerradoRecepcao={recepcaoMostrarBotaoEncerrado(
                spec,
                atendimentoEncerradoMap,
                agoraRecepcao,
                onToggleAtendimentoEncerrado
              )}
            />
          ))}
        </Section>
      ))}
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
  onSolicitar,
  solicitacaoEncaminhamentoObrigatorio,
}) {
  const used = sess.used ?? 0;
  const reserved = sess.reserved ?? 0;
  const total = sess.total ?? 0;
  const livres = Math.max(0, total - used - reserved);
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
    typeof onSolicitar === "function" && (isFisio || wl || livres > 0);
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
        {sess.label}
        <MedicoBadge tipo={sess.medicoTipo} />
        {sess.pccuOnly && <span style={styles.pccuTag}>PCCU</span>}
      </p>
      {!ocultarEsgotadoPorListaEspera && (
        <p
          style={
            somenteEncaixe
              ? { ...styles.encaixeAgenteAviso, marginTop: 6 }
              : {
                  ...styles.livresResumo,
                  marginTop: 6,
                  fontSize: 14,
                  fontWeight: livresComuns > 0 ? 600 : 700,
                  color: livresComuns > 0 ? "#15803D" : "#B91C1C",
                }
          }
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
            })
          }
        >
          {somenteEncaixe ? "Solicitar encaixe" : "Solicitar agendamento"}
        </button>
      )}
    </div>
  );
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
}) {
  const meta = SPEC_META[spec.key] || { role: "", av: "?", bg: "#F1F5F9", tc: "#475569" };
  const name = nomeProfissionalFirestore(spec.key, profissionaisMap);
  const hasSome = spec.sessions.some((s) => {
    if (s.waitlistEnabled) return true;
    const tot = s.total ?? 0;
    return (s.used ?? 0) + (s.reserved ?? 0) < tot;
  });
  const isSame = spec.windowType === "same";
  const dataEncerrado =
    typeof spec.atendimentoDate === "string" && spec.atendimentoDate
      ? spec.atendimentoDate
      : "";
  const keyEncerrado =
    dataEncerrado && atendimentoEncerradoKey(spec.key, dataEncerrado);
  const atendimentoEncerradoAtivo =
    !!keyEncerrado && !!atendimentoEncerradoMap[keyEncerrado];

  return (
    <div
      style={{
        ...styles.card,
        border: isSame ? "1px solid #86EFAC" : "1px solid #E2E8F0",
        boxShadow: isSame
          ? "0 4px 14px rgba(22, 101, 52, 0.08)"
          : "0 2px 8px rgba(15, 23, 42, 0.06)",
        opacity: hasSome ? 1 : 0.85,
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
            {!hasSome && <span style={styles.fullBadge}>Esgotado</span>}
          </div>
        </div>

        {!isRecepcao && (
          <div style={styles.cardResumoAgente}>
            {spec.sessions.map((sess, idx) => (
              <AgenteTurnoRow
                key={idx}
                sess={sess}
                isLast={idx === spec.sessions.length - 1}
                specKey={spec.key}
                dayKey={spec.atendimentoDia}
                sessIdx={idx}
                atendimentoDate={spec.atendimentoDate}
                onSolicitar={onSolicitar}
                solicitacaoEncaminhamentoObrigatorio={spec.solicitacaoEncaminhamentoObrigatorio}
              />
            ))}
          </div>
        )}

        {isRecepcao &&
          spec.sessions.map((sess, idx) => (
            <SessionRow
              key={idx}
              sess={sess}
              sessIdx={idx}
              specKey={spec.key}
              dayKey={spec.atendimentoDia}
              atendimentoDate={spec.atendimentoDate}
              isRecepcao
              onSlotAction={onSlotAction}
            />
          ))}

        {isRecepcao &&
          mostrarBotaoEncerradoRecepcao &&
          dataEncerrado &&
          typeof onToggleAtendimentoEncerrado === "function" && (
            <div style={styles.cardFooterRecepcao}>
              <button
                type="button"
                style={
                  atendimentoEncerradoAtivo
                    ? styles.btnAtendimentoEncerradoAtivo
                    : styles.btnAtendimentoFinalizado
                }
                onClick={() =>
                  onToggleAtendimentoEncerrado(
                    spec.key,
                    dataEncerrado,
                    !atendimentoEncerradoAtivo
                  )
                }
              >
                {atendimentoEncerradoAtivo
                  ? "Remover aviso de atendimento encerrado"
                  : "Atendimento finalizado"}
              </button>
            </div>
          )}
      </div>
    </div>
  );
}

function SessionRow({
  sess,
  sessIdx,
  specKey,
  dayKey,
  atendimentoDate,
  isRecepcao,
  onSlotAction,
}) {
  const used = sess.used ?? 0;
  const reserved = sess.reserved ?? 0;
  const total = sess.total ?? 0;
  const livres = total - used - reserved;
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
  let pct = 0;
  if (temEncaixe) {
    if (faseComuns) {
      livresRecepcao = baseAgenda - filled;
      textoPill = `${livresRecepcao}/${baseAgenda} livres (comuns)`;
      pct = baseAgenda ? Math.min(100, Math.round((filled / baseAgenda) * 100)) : 0;
    } else if (!agendaCheia) {
      livresRecepcao = total - filled;
      textoPill = `${livresRecepcao}/${encaixeExtra} encaixe(s) livre(s)`;
      pct = encaixeExtra
        ? Math.min(100, Math.round(((filled - baseAgenda) / encaixeExtra) * 100))
        : 0;
    } else {
      livresRecepcao = 0;
      textoPill = `0/${total} livres`;
      pct = 100;
    }
  } else {
    textoPill = `${livres}/${total} livres`;
    pct = total ? Math.min(100, Math.round((filled / total) * 100)) : 0;
  }

  const cheio = livres <= 0;
  const barFillBg = cheio
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
            {sess.label}
            <MedicoBadge tipo={sess.medicoTipo} />
            {sess.pccuOnly && <span style={styles.pccuTag}>PCCU</span>}
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
              width: `${pct}%`,
              background: barFillBg,
            }}
          />
        </div>
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
        </div>
      </div>
    </div>
  );
}

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
  empty: { textAlign: "center", padding: "48px 20px" },
  alertSemVagas: {
    marginBottom: 20,
    padding: "16px 18px",
    borderRadius: 12,
    border: "1px solid #FECACA",
    background: "linear-gradient(180deg, #FEF2F2 0%, #FFF1F2 100%)",
  },
  alertSemVagasTitle: {
    margin: "0 0 6px",
    fontSize: 15,
    fontWeight: 700,
    color: "#991B1B",
  },
  alertSemVagasText: {
    margin: 0,
    fontSize: 13,
    color: "#7F1D1D",
    lineHeight: 1.45,
  },
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
    gap: 4,
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
  barTrackCheio: {
    background: "#DCFCE7",
    boxShadow: "inset 0 0 0 1px #86EFAC",
  },
  barFill: { height: "100%", borderRadius: 999, transition: "width 0.2s ease" },
  livresResumo: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.35,
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
  encaixeAgenteAviso: {
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.45,
    color: "#9A3412",
  },
};

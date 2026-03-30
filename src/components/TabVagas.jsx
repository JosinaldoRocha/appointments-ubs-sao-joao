// src/components/TabVagas.jsx
import { SPEC_META, DAY_LABEL, MEDICO_TIPO, DEFAULT_PROF_NAMES } from "../services/scheduleConfig";

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

/** Recepção: há vaga livre para ocupar ou reserva pendente que pode virar confirmada. */
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
}) {
  const prev = specs.filter((s) => s.windowType === "prev");
  const same = specs.filter((s) => s.windowType === "same");
  const semVagasLivres = specs.length > 0 && !hasAnyVacancy(specs);

  if (specs.length === 0) {
    return (
      <div style={styles.empty}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>
          Nenhum agendamento disponível hoje
        </p>
        <p style={{ fontSize: 13, color: "#64748B" }}>
          Em geral, o agendamento abre no último dia útil anterior ao atendimento (feriados são
          considerados). Nutrição e fisioterapia permitem agendar em qualquer dia útil (conforme o card).
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
            label="Nutrição e fisioterapia: agendamento em qualquer dia útil (dia de atendimento no card)"
          />
          <LegendItem color="#DCFCE7" border="#86EFAC" label="Atendimento hoje — vagas sobrando" />
        </div>
      )}

      {same.length > 0 && (
        <Section title="Atendimento hoje — vagas disponíveis agora" highlight>
          {same.map((spec) => (
            <SpecCard
              key={`same-${spec.atendimentoDate}_${spec.key}`}
              spec={spec}
              profissionaisMap={profissionaisMap}
              isRecepcao={isRecepcao}
              onSlotAction={onSlotAction}
              onSolicitar={onSolicitar}
            />
          ))}
        </Section>
      )}

      {prev.length > 0 && (
        <Section
          title={`Agendamento · atendimento em ${[
            ...new Set(prev.map((s) => DAY_LABEL[s.atendimentoDia] || s.atendimentoDia)),
          ].join(", ")}`}
        >
          {prev.map((spec) => (
            <SpecCard
              key={`prev-${spec.atendimentoDate}_${spec.key}`}
              spec={spec}
              profissionaisMap={profissionaisMap}
              isRecepcao={isRecepcao}
              onSlotAction={onSlotAction}
              onSolicitar={onSolicitar}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children, highlight }) {
  return (
    <div style={styles.section}>
      <p style={{ ...styles.sectionTitle, color: highlight ? "#15803D" : "#475569" }}>{title}</p>
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
  const wl = sess.waitlistEnabled;
  const isFisio = specKey === "fisio";
  /** Fisioterapia: sempre há “vaga” de solicitação (lista de espera na recepção), mesmo com agenda cheia. */
  const podeSolicitar =
    typeof onSolicitar === "function" && (isFisio || wl || livres > 0);

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
      {!(isFisio && livres === 0) && (
        <p
          style={{
            ...styles.livresResumo,
            marginTop: 6,
            fontSize: 14,
            fontWeight: livres > 0 ? 600 : 700,
            color: livres > 0 ? "#15803D" : "#B91C1C",
          }}
        >
          {livres > 0
            ? `${livres} ${livres === 1 ? "vaga disponível" : "vagas disponíveis"}`
            : "Vagas esgotadas nesta data"}
        </p>
      )}
      {isFisio && (
        <p
          style={
            livres === 0
              ? styles.agenteTurnoHintCheia
              : styles.agenteTurnoHint
          }
        >
          {livres > 0
            ? "Solicite pelo WhatsApp (encaminhamento obrigatório). Se a agenda encher, a recepção pode tratar o pedido como lista de espera."
            : "A agenda está cheia. Solicite um agendamento para a lista de espera."}
        </p>
      )}
      {!isFisio && wl && (
        <p style={styles.agenteTurnoHint}>
          Há possibilidade de solicitar agendamento pelo WhatsApp (encaminhamento obrigatório).
        </p>
      )}
      {podeSolicitar && (
        <button
          type="button"
          style={styles.btnSolicAgente}
          onClick={() =>
            onSolicitar({
              specKey,
              dayKey,
              sessIdx,
              sessLabel: sess.label,
              medicoTipo: sess.medicoTipo,
              atendimentoDate,
              solicitacaoEncaminhamentoObrigatorio,
            })
          }
        >
          Solicitar agendamento
        </button>
      )}
    </div>
  );
}

function SpecCard({ spec, profissionaisMap, isRecepcao, onSlotAction, onSolicitar }) {
  const meta = SPEC_META[spec.key] || { role: "", av: "?", bg: "#F1F5F9", tc: "#475569" };
  const name = nomeProfissionalFirestore(spec.key, profissionaisMap);
  const hasSome = spec.sessions.some((s) => {
    if (s.waitlistEnabled) return true;
    const tot = s.total ?? 0;
    return (s.used ?? 0) + (s.reserved ?? 0) < tot;
  });
  const isSame = spec.windowType === "same";

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
  const ocupadas = used;
  const livres = total - used - reserved;

  const cheio = livres <= 0;
  const pct = total ? Math.min(100, Math.round(((used + reserved) / total) * 100)) : 0;
  const barFillBg = cheio
    ? "#22C55E"
    : used + reserved === 0
      ? "#22C55E"
      : "#3B82F6";

  return (
    <div style={styles.sessRow}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.sessTitleRow}>
          <p style={styles.sessLabel}>
            {sess.label}
            <MedicoBadge tipo={sess.medicoTipo} />
            {sess.pccuOnly && <span style={styles.pccuTag}>PCCU</span>}
          </p>
          <span
            style={{
              ...styles.ratioPill,
              color: cheio ? "#15803D" : livres > 0 ? "#166534" : "#991B1B",
            }}
          >
            {livres}/{total} livres
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
            <strong style={{ color: "#166534" }}>{livres}</strong> livre(s)
          </span>
          <span>
            <strong style={{ color: "#C2410C" }}>{reserved}</strong> reserva(s)
          </span>
          <span>
            <strong style={{ color: "#475569" }}>{ocupadas}</strong> confirmada(s)
          </span>
        </div>
      </div>
      <div style={styles.sessActions}>
        <div style={styles.recepPair} role="group" aria-label="Ajustar vagas preenchidas">
          <button
            type="button"
            style={styles.btnRecepAdd}
            disabled={!podePreencherVaga(reserved, used, total, livres)}
            title={
              livres > 0
                ? "Adicionar uma vaga confirmada (preenchida)"
                : reserved > 0 && used < total
                  ? "Confirmar reserva pendente como vaga preenchida"
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
            + Preencher
          </button>
          <button
            type="button"
            style={styles.btnRecepRemove}
            disabled={reserved <= 0 && used <= 0}
            title={
              reserved > 0
                ? "Remover uma reserva pendente"
                : used > 0
                  ? "Liberar uma vaga confirmada"
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
            − Liberar
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
    alignItems: "stretch",
    justifyContent: "space-between",
    flexWrap: "wrap",
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
    gap: 8,
    marginBottom: 8,
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
  },
  ratioPill: {
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 6,
    background: "#F1F5F9",
    flexShrink: 0,
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
    minWidth: 168,
    flexShrink: 0,
  },
  recepPair: {
    display: "flex",
    flexDirection: "row",
    gap: 8,
    width: "100%",
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
};

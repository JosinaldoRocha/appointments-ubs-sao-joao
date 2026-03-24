// src/components/TabVagas.jsx
import { SPEC_META, DAY_LABEL, MEDICO_TIPO } from "../services/scheduleConfig";

export default function TabVagas({
  specs,
  profNames,
  isRecepcao,
  onSlotAction,
  onSolicitar,
  onEspera,
}) {
  const prev = specs.filter((s) => s.windowType === "prev");
  const same = specs.filter((s) => s.windowType === "same");

  if (specs.length === 0) {
    return (
      <div style={styles.empty}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>
          Nenhum agendamento disponível hoje
        </p>
        <p style={{ fontSize: 13, color: "#64748B" }}>
          O agendamento ocorre no último dia útil anterior ao atendimento (feriados são considerados
          automaticamente).
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.legend}>
        <LegendItem color="#DBEAFE" border="#93C5FD" label="Agendamento (dia útil anterior)" />
        <LegendItem color="#DCFCE7" border="#86EFAC" label="Atendimento hoje — vagas sobrando" />
      </div>

      {same.length > 0 && (
        <Section title="Atendimento hoje — vagas disponíveis agora" highlight>
          {same.map((spec) => (
            <SpecCard
              key={`same-${spec.atendimentoDate}_${spec.key}`}
              spec={spec}
              profNames={profNames}
              isRecepcao={isRecepcao}
              onSlotAction={onSlotAction}
              onSolicitar={onSolicitar}
              onEspera={onEspera}
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
              profNames={profNames}
              isRecepcao={isRecepcao}
              onSlotAction={onSlotAction}
              onSolicitar={onSolicitar}
              onEspera={onEspera}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children, highlight }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ ...styles.sectionTitle, color: highlight ? "#166534" : "#475569" }}>{title}</p>
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

function SpecCard({ spec, profNames, isRecepcao, onSlotAction, onSolicitar, onEspera }) {
  const meta = SPEC_META[spec.key] || { role: "", av: "?", bg: "#F1F5F9", tc: "#475569" };
  const name = profNames[spec.key] || spec.key;
  const hasSome = spec.sessions.some(
    (s) => !s.waitlistEnabled && s.used + s.reserved < s.total
  );
  const isSame = spec.windowType === "same";

  return (
    <div
      style={{
        ...styles.card,
        border: isSame ? "2px solid #86EFAC" : "0.5px solid #E2E8F0",
        opacity: hasSome ? 1 : 0.72,
      }}
    >
      <div style={styles.cardHeader}>
        <div style={{ ...styles.av, background: meta.bg, color: meta.tc }}>{meta.av}</div>
        <div style={{ flex: 1 }}>
          <p style={styles.cardName}>{name}</p>
          <p style={styles.cardRole}>{meta.role}</p>
          <p style={styles.cardDate}>
            Data do atendimento:{" "}
            {spec.atendimentoDate
              ? new Date(spec.atendimentoDate + "T12:00:00").toLocaleDateString("pt-BR")
              : "—"}
          </p>
        </div>
        <span
          style={{
            ...styles.winTag,
            background: isSame ? "#DCFCE7" : "#DBEAFE",
            color: isSame ? "#166534" : "#1E40AF",
          }}
        >
          {isSame ? "Hoje" : `Para ${DAY_LABEL[spec.atendimentoDia]?.split("-")[0] || ""}`}
        </span>
        {!hasSome && <span style={styles.fullBadge}>Esgotado</span>}
      </div>

      {spec.sessions.map((sess, idx) => (
        <SessionRow
          key={idx}
          sess={sess}
          sessIdx={idx}
          specKey={spec.key}
          dayKey={spec.atendimentoDia}
          atendimentoDate={spec.atendimentoDate}
          isRecepcao={isRecepcao}
          canBook={!isRecepcao}
          onSlotAction={onSlotAction}
          onSolicitar={onSolicitar}
          onEspera={onEspera}
        />
      ))}
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
  canBook,
  onSlotAction,
  onSolicitar,
  onEspera,
}) {
  const used = sess.used ?? 0;
  const reserved = sess.reserved ?? 0;
  const total = sess.total ?? 0;
  const ocupadas = used;
  const livres = total - used - reserved;
  const dots = Math.min(total, 10);
  const filledDots = Math.round(((used + reserved) / total) * dots);

  if (sess.waitlistEnabled) {
    return (
      <div style={styles.sessRow}>
        <div>
          <p style={styles.sessLabel}>
            {sess.label}
            {sess.pccuOnly && (
              <span style={styles.pccuTag}>PCCU</span>
            )}
          </p>
          <p style={{ fontSize: 11, color: "#D97706", marginTop: 2 }}>Lista de espera ativa</p>
        </div>
        {(canBook || isRecepcao) && (
          <button
            style={styles.btnSolic}
            onClick={() =>
              onEspera({ specKey, dayKey, sessIdx, sessLabel: sess.label, atendimentoDate })
            }
          >
            + Espera
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={styles.sessRow}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={styles.sessLabel}>
          {sess.label}
          <MedicoBadge tipo={sess.medicoTipo} />
          {sess.pccuOnly && <span style={styles.pccuTag}>PCCU</span>}
        </p>
        <div style={styles.dots}>
          {Array.from({ length: dots }).map((_, i) => (
            <span
              key={i}
              style={{
                ...styles.dot,
                background: i < filledDots ? "#CBD5E1" : "#22C55E",
              }}
            />
          ))}
        </div>
        <p style={styles.countLine}>
          <span style={{ color: "#166534" }}>{livres} livre(s)</span>
          {" · "}
          <span style={{ color: "#B45309" }}>{reserved} reserva(s)</span>
          {" · "}
          <span style={{ color: "#64748B" }}>{ocupadas} confirmada(s)</span>
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        {isRecepcao && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
            <button
              type="button"
              style={{ ...styles.btnSmall, background: "#FEE2E2", color: "#991B1B", borderColor: "#FECACA" }}
              disabled={used >= total}
              title="Marcar vaga confirmada (ocupada)"
              onClick={() =>
                onSlotAction({ specKey, dayKey, sessIdx, atendimentoDate, action: "incOcupada" })
              }
            >
              + Ocup.
            </button>
            <button
              type="button"
              style={{ ...styles.btnSmall, background: "#DCFCE7", color: "#166534", borderColor: "#86EFAC" }}
              disabled={used <= 0}
              title="Liberar vaga confirmada"
              onClick={() =>
                onSlotAction({ specKey, dayKey, sessIdx, atendimentoDate, action: "decOcupada" })
              }
            >
              − Ocup.
            </button>
            <button
              type="button"
              style={{ ...styles.btnSmall, background: "#FEF3C7", color: "#92400E", borderColor: "#FCD34D" }}
              disabled={livres <= 0}
              title="Reservar (em confirmação)"
              onClick={() =>
                onSlotAction({ specKey, dayKey, sessIdx, atendimentoDate, action: "incReserva" })
              }
            >
              + Reserva
            </button>
            <button
              type="button"
              style={{ ...styles.btnSmall, background: "#FFEDD5", color: "#9A3412", borderColor: "#FDBA74" }}
              disabled={reserved <= 0}
              title="Remover reserva"
              onClick={() =>
                onSlotAction({ specKey, dayKey, sessIdx, atendimentoDate, action: "decReserva" })
              }
            >
              − Reserva
            </button>
            <button
              type="button"
              style={{ ...styles.btnSmall, background: "#E0E7FF", color: "#3730A3", borderColor: "#A5B4FC" }}
              disabled={reserved <= 0 || used >= total}
              title="Confirmar reserva (vira ocupada)"
              onClick={() =>
                onSlotAction({
                  specKey,
                  dayKey,
                  sessIdx,
                  atendimentoDate,
                  action: "confirmarReserva",
                })
              }
            >
              ✓ Reserva
            </button>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ ...styles.count, color: livres > 0 ? "#166534" : "#991B1B" }}>
            {livres}/{total}
          </span>
          {canBook && livres > 0 && (
            <button
              style={styles.btnSolic}
              onClick={() =>
                onSolicitar({
                  specKey,
                  dayKey,
                  sessIdx,
                  sessLabel: sess.label,
                  atendimentoDate,
                })
              }
            >
              Solicitar
            </button>
          )}
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
  empty: { textAlign: "center", padding: "40px 20px" },
  legend: { display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: "0 0 8px",
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 },
  card: { background: "#fff", borderRadius: 12, padding: "12px 14px" },
  cardHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" },
  av: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  },
  cardName: { fontSize: 14, fontWeight: 600, color: "#0F172A", margin: 0 },
  cardRole: { fontSize: 12, color: "#64748B", margin: 0 },
  cardDate: { fontSize: 11, color: "#0369A1", margin: "4px 0 0" },
  winTag: { fontSize: 11, padding: "2px 7px", borderRadius: 4, fontWeight: 500 },
  fullBadge: {
    fontSize: 11,
    background: "#FEE2E2",
    color: "#991B1B",
    padding: "3px 7px",
    borderRadius: 4,
    fontWeight: 500,
  },
  sessRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: "7px 9px",
    background: "#F8FAFC",
    borderRadius: 8,
    marginBottom: 5,
    gap: 8,
  },
  sessLabel: { fontSize: 12, color: "#64748B", margin: 0, display: "flex", alignItems: "center", flexWrap: "wrap" },
  pccuTag: {
    fontSize: 9,
    fontWeight: 700,
    marginLeft: 6,
    padding: "2px 5px",
    borderRadius: 4,
    background: "#EDE9FE",
    color: "#5B21B6",
  },
  dots: { display: "flex", gap: 2, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: "50%" },
  countLine: { fontSize: 10, color: "#64748B", margin: "4px 0 0" },
  count: { fontSize: 12, fontWeight: 600 },
  btnSmall: {
    padding: "3px 6px",
    fontSize: 10,
    fontWeight: 600,
    border: "1px solid",
    borderRadius: 5,
    cursor: "pointer",
  },
  btnSolic: {
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 600,
    border: "0.5px solid #E2E8F0",
    borderRadius: 6,
    cursor: "pointer",
    background: "transparent",
    color: "#0F172A",
  },
};

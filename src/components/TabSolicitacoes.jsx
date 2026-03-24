// src/components/TabSolicitacoes.jsx
export default function TabSolicit({ solicitacoes, profNames, isRecepcao, onHandle }) {
  const pend = solicitacoes.filter((s) => s.status === "pendente");
  const hist = solicitacoes.filter((s) => s.status !== "pendente");

  if (!solicitacoes.length) return <p style={S.empty}>Nenhuma solicitação ainda.</p>;

  return (
    <div>
      {pend.length > 0 && (
        <>
          <p style={S.dh}>Aguardando confirmação ({pend.length})</p>
          {pend.map((r) => <ReqCard key={r.id} r={r} profNames={profNames} isRecepcao={isRecepcao} onHandle={onHandle} />)}
        </>
      )}
      {hist.length > 0 && (
        <>
          <p style={{ ...S.dh, marginTop: 16 }}>Histórico</p>
          {hist.map((r) => <ReqCard key={r.id} r={r} profNames={profNames} isRecepcao={isRecepcao} onHandle={onHandle} />)}
        </>
      )}
    </div>
  );
}

function ReqCard({ r, profNames, isRecepcao, onHandle }) {
  const nome = profNames[r.specKey] || r.specKey;
  const colors = {
    pendente:  { bg: "#FFFBEB", left: "#F59E0B", badge: "#FFFBEB", badgeT: "#92400E", label: "Pendente" },
    aprovado:  { bg: "#F0FDF4", left: "#22C55E", badge: "#DCFCE7", badgeT: "#166534", label: "Confirmado" },
    recusado:  { bg: "#FFF1F2", left: "#F43F5E", badge: "#FFE4E6", badgeT: "#9F1239", label: "Recusado" },
  };
  const c = colors[r.status] || colors.pendente;
  const ts = r.criadoEm?.toDate?.()?.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) || "Agora";

  return (
    <div style={{ ...S.card, background: c.bg, borderLeft: `3px solid ${c.left}`, borderRadius: "0 10px 10px 0", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={S.ri}>👤</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={S.rp}>{r.paciente}</span>
            <span style={{ ...S.badge, background: c.badge, color: c.badgeT }}>{c.label}</span>
          </div>
          <p style={S.rd}>
            {nome} · {r.sessLabel}
            {r.atendimentoDate
              ? <> · Atend.: {new Date(r.atendimentoDate + "T12:00:00").toLocaleDateString("pt-BR")}</>
              : null}
            <br />
            Agente: {r.agenteNome} · {r.telefone}
          </p>
          <p style={S.rt}>{ts}</p>
          {isRecepcao && r.status === "pendente" && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                style={S.bAppr}
                onClick={() =>
                  onHandle(r.id, "aprovado", r.specKey, r.dayKey, r.sessIdx, r.atendimentoDate)
                }
              >
                Confirmar
              </button>
              <button
                style={S.bRej}
                onClick={() =>
                  onHandle(r.id, "recusado", r.specKey, r.dayKey, r.sessIdx, r.atendimentoDate)
                }
              >
                Recusar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  empty: { textAlign: "center", padding: "40px 20px", color: "#64748B", fontSize: 13 },
  dh:    { fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" },
  card:  { background: "#fff", border: "0.5px solid #E2E8F0", padding: "12px 14px", marginBottom: 8 },
  ri:    { width: 32, height: 32, borderRadius: "50%", background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 },
  rp:    { fontSize: 14, fontWeight: 600, color: "#0F172A" },
  rd:    { fontSize: 12, color: "#64748B", margin: "2px 0 0", lineHeight: 1.5 },
  rt:    { fontSize: 11, color: "#94A3B8", marginTop: 3 },
  badge: { fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 4 },
  bAppr: { padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", background: "#DCFCE7", color: "#166534" },
  bRej:  { padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", background: "#FEE2E2", color: "#991B1B" },
};

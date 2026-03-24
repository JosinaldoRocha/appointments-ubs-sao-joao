// src/components/TabEspera.jsx
export default function TabEspera({ lista, isRecepcao, isAgente, onRemover, onAdicionar }) {
  return (
    <div>
      <p style={S.dh}>Dra. Aracele (Fisioterapeuta) — lista de espera</p>
      <p style={S.sub}>Pacientes aguardam vaga entre os 6 atendimentos de quinta e sexta pela manhã.</p>

      {lista.length === 0 && <p style={S.empty}>Lista de espera vazia.</p>}

      {lista.map((p, i) => {
        const ts = p.criadoEm?.toDate?.()?.toLocaleDateString("pt-BR") || "";
        return (
          <div key={p.id} style={S.item}>
            <div style={S.pos}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <p style={S.name}>{p.paciente}</p>
              <p style={S.detail}>{p.telefone} · Agente: {p.agenteNome}</p>
            </div>
            <span style={S.date}>{ts}</span>
            {isRecepcao && (
              <button style={S.btnRem} onClick={() => onRemover(p.id)}>Remover</button>
            )}
          </div>
        );
      })}

      {isAgente && (
        <button style={S.btnAdd} onClick={onAdicionar}>+ Adicionar à lista de espera</button>
      )}
    </div>
  );
}

const S = {
  dh:     { fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px" },
  sub:    { fontSize: 13, color: "#64748B", marginBottom: 12 },
  empty:  { textAlign: "center", padding: "32px 20px", color: "#94A3B8", fontSize: 13 },
  item:   { display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "#F8FAFC", borderRadius: 8, marginBottom: 6 },
  pos:    { width: 24, height: 24, borderRadius: "50%", background: "#FFFBEB", color: "#92400E", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 },
  name:   { fontSize: 13, fontWeight: 600, color: "#0F172A", margin: 0 },
  detail: { fontSize: 12, color: "#64748B", margin: 0 },
  date:   { fontSize: 11, color: "#94A3B8" },
  btnRem: { fontSize: 11, border: "none", background: "#FEE2E2", color: "#991B1B", borderRadius: 4, padding: "3px 8px", cursor: "pointer", marginLeft: 4 },
  btnAdd: { marginTop: 12, width: "100%", padding: 10, fontSize: 13, border: "1px solid #E2E8F0", borderRadius: 8, background: "transparent", color: "#475569", cursor: "pointer" },
};

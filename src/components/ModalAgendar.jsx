// src/components/ModalAgendar.jsx
import { useState } from "react";
import { SPEC_META } from "../services/scheduleConfig";

export default function ModalAgendar({ ctx, profNames, onSubmit, onClose }) {
  const [paciente, setPaciente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro]         = useState("");

  const isEspera = ctx.type === "espera";
  const nome     = profNames[ctx.specKey] || ctx.specKey || "Fisioterapeuta";
  const meta     = SPEC_META[ctx.specKey] || {};

  function handleTel(v) {
    const d = v.replace(/\D/g, "").slice(0, 11);
    const f = d.length <= 10
      ? d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3")
      : d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
    setTelefone(f);
  }

  function submit() {
    if (!paciente.trim()) { setErro("Informe o nome do paciente."); return; }
    if (telefone.replace(/\D/g, "").length < 10) { setErro("Informe um telefone válido."); return; }
    onSubmit({ ...ctx, paciente: paciente.trim(), telefone });
  }

  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.header}>
          {ctx.specKey && (
            <div style={{ ...S.av, background: meta.bg || "#F1F5F9", color: meta.tc || "#475569" }}>
              {meta.av || "?"}
            </div>
          )}
          <div>
            <p style={S.title}>{isEspera ? "Entrar na lista de espera" : "Solicitar agendamento"}</p>
            <p style={S.sub}>
              {nome}
              {ctx.sessLabel ? ` · ${ctx.sessLabel}` : ""}
              {ctx.atendimentoDate
                ? ` · Atend.: ${new Date(ctx.atendimentoDate + "T12:00:00").toLocaleDateString("pt-BR")}`
                : ""}
            </p>
          </div>
        </div>

        <div style={S.body}>
          <Field label="Nome completo do paciente">
            <input style={S.input} value={paciente} onChange={(e) => setPaciente(e.target.value)} placeholder="Ex.: João da Silva" autoFocus />
          </Field>
          <Field label="Telefone (WhatsApp de preferência)">
            <input style={S.input} value={telefone} onChange={(e) => handleTel(e.target.value)} placeholder="(99) 99999-9999" inputMode="numeric" />
          </Field>
        </div>

        {erro && <p style={S.erro}>{erro}</p>}

        <div style={S.actions}>
          <button style={S.btnCancel} onClick={onClose}>Cancelar</button>
          <button style={S.btnOk} onClick={submit}>
            {isEspera ? "Adicionar à espera" : "Enviar solicitação"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

const S = {
  overlay:   { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal:     { background: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.16)" },
  header:    { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  av:        { width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0 },
  title:     { fontSize: 15, fontWeight: 600, color: "#0F172A", margin: 0 },
  sub:       { fontSize: 12, color: "#64748B", margin: 0 },
  body:      {},
  input:     { padding: "9px 11px", fontSize: 14, border: "1px solid #E2E8F0", borderRadius: 8, background: "#fff", color: "#0F172A", outline: "none", width: "100%" },
  erro:      { fontSize: 12, color: "#DC2626", background: "#FEF2F2", padding: "6px 10px", borderRadius: 6, marginBottom: 12 },
  actions:   { display: "flex", gap: 10 },
  btnCancel: { flex: 1, padding: 10, fontSize: 13, border: "1px solid #E2E8F0", borderRadius: 8, cursor: "pointer", background: "transparent", color: "#64748B" },
  btnOk:     { flex: 1, padding: 10, fontSize: 13, fontWeight: 600, border: "none", borderRadius: 8, cursor: "pointer", background: "#0C447C", color: "#fff" },
};

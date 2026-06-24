import { sessaoLabelParaTurno } from "../services/scheduleConfig";
import { splitTurnoObservacao } from "../services/whatsappSolicitacao";

const pillBase = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  padding: "8px 15px",
  borderRadius: 999,
  flexShrink: 0,
  verticalAlign: "middle",
  lineHeight: 1.05,
  boxSizing: "border-box",
};

const pillManha = {
  ...pillBase,
  background: "linear-gradient(145deg, #FFFBEB 0%, #FEF08A 40%, #FACC15 100%)",
  color: "#713F12",
  border: "2px solid #CA8A04",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.65), 0 2px 0 rgba(113, 63, 18, 0.12), 0 6px 16px rgba(202, 138, 4, 0.35)",
};

/** Tarde: mesma paleta do botão “Solicitar agendamento” (`btnSolicAgente`). */
const pillTarde = {
  ...pillBase,
  background: "linear-gradient(145deg, #818CF8 0%, #4F46E5 55%, #3730A3 100%)",
  color: "#fff",
  border: "2px solid #312E81",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(67,56,202,0.25), 0 4px 14px rgba(67,56,202,0.4)",
};

const sufixoStyle = {
  fontWeight: 600,
  color: "#475569",
  fontSize: 13,
};

/**
 * Rótulo da sessão com “Manhã” / “Tarde” em evidência; o restante do texto segue ao lado.
 */
export function SessaoLabelComDestaqueTurno({ label, children }) {
  const { turno, observacao } = splitTurnoObservacao(label);
  const kind = sessaoLabelParaTurno(turno) || sessaoLabelParaTurno(label);
  const sufixo = observacao ? ` – ${observacao}` : "";

  if (kind === "manha" || kind === "tarde") {
    return (
      <>
        <span style={kind === "manha" ? pillManha : pillTarde}>{turno}</span>
        {sufixo ? <span style={sufixoStyle}>{sufixo}</span> : null}
        {children}
      </>
    );
  }
  return (
    <>
      {label || "—"}
      {children}
    </>
  );
}

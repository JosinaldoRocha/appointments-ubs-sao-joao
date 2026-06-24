// src/pages/RecuperarSenha.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import AppLogo from "../components/AppLogo";
import { enviarEmailRedefinicaoSenha } from "../services/auth";

export default function RecuperarSenha() {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    const emailNorm = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      setErro("Informe um e-mail válido.");
      return;
    }
    setLoading(true);
    try {
      await enviarEmailRedefinicaoSenha(emailNorm);
      setEnviado(true);
    } catch (err) {
      const code = err?.code;
      if (code === "auth/user-not-found") {
        setErro("Não há conta com este e-mail. Use o mesmo e-mail cadastrado na unidade.");
      } else if (code === "auth/too-many-requests") {
        setErro("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
      } else {
        setErro(err?.message || "Não foi possível enviar. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.bg}>
      <div style={styles.card}>
        <div style={styles.logoArea}>
          <AppLogo size={52} title="UBS Agendamentos" style={{ margin: "0 auto 12px" }} />
          <h1 style={styles.title}>Redefinir senha</h1>
          <p style={styles.sub}>
            Mesmo fluxo para todos os perfis. Informe o <strong>e-mail</strong> em que você entra no sistema
            (cadastrado na unidade). O link para criar uma nova senha chega só na sua caixa de entrada.
          </p>
        </div>

        {enviado ? (
          <div style={styles.okBox}>
            <p style={styles.okText}>
              Se existir uma conta com este e-mail, enviamos as instruções. Verifique a caixa de entrada e o
              spam.
            </p>
            <Link to="/login" style={styles.linkBtn}>
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>E-mail</label>
              <input
                style={styles.input}
                type="email"
                inputMode="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={120}
                autoComplete="email"
              />
            </div>

            {erro && <p style={styles.erro}>{erro}</p>}

            <button style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
              {loading ? "Enviando…" : "Enviar link de redefinição"}
            </button>
          </form>
        )}

        <p style={styles.footer}>
          <Link to="/login" style={styles.link}>
            ← Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  bg: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #EEF2FF 0%, #F8FAFC 55%, #EEF2FF 100%)",
    padding: "16px",
  },
  card: {
    background: "#fff",
    borderRadius: 20,
    border: "1px solid #E2E8F0",
    padding: "36px 30px",
    width: "100%",
    maxWidth: "400px",
    boxShadow: "0 8px 32px rgba(67,56,202,0.09), 0 2px 8px rgba(0,0,0,0.04)",
  },
  logoArea: { textAlign: "center", marginBottom: "24px" },
  title: { fontSize: "22px", fontWeight: "700", color: "#0F172A", margin: "0 0 8px", letterSpacing: "-0.02em" },
  sub: { fontSize: "13px", color: "#64748B", margin: 0, lineHeight: 1.5, textAlign: "left" },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  field: { display: "flex", flexDirection: "column", gap: "5px" },
  label: { fontSize: "12px", color: "#475569", fontWeight: "600", letterSpacing: "0.01em" },
  input: {
    padding: "11px 13px",
    fontSize: "15px",
    border: "1.5px solid #E2E8F0",
    borderRadius: "10px",
    outline: "none",
    background: "#fff",
    color: "#0F172A",
  },
  erro: {
    fontSize: "13px",
    color: "#DC2626",
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    borderRadius: "8px",
    padding: "10px 13px",
    margin: 0,
    lineHeight: 1.5,
  },
  btn: {
    padding: "13px",
    background: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    letterSpacing: "0.01em",
    boxShadow: "0 3px 10px rgba(67,56,202,0.3)",
  },
  okBox: { textAlign: "center" },
  okText: { fontSize: "14px", color: "#0F172A", lineHeight: 1.6, margin: "0 0 18px" },
  linkBtn: {
    display: "inline-block",
    padding: "11px 24px",
    background: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)",
    color: "#fff",
    borderRadius: "10px",
    fontSize: "14px",
    fontWeight: "700",
    textDecoration: "none",
    boxShadow: "0 3px 10px rgba(67,56,202,0.3)",
  },
  footer: { marginTop: "20px", textAlign: "center", marginBottom: 0 },
  link: { fontSize: "13px", color: "#4338CA", fontWeight: "600", textDecoration: "none" },
};

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
    background: "#F1F5F9",
    padding: "16px",
  },
  card: {
    background: "#fff",
    borderRadius: "16px",
    border: "0.5px solid #E2E8F0",
    padding: "32px 28px",
    width: "100%",
    maxWidth: "400px",
  },
  logoArea: { textAlign: "center", marginBottom: "24px" },
  title: { fontSize: "20px", fontWeight: "600", color: "#0F172A", margin: "0 0 8px" },
  sub: { fontSize: "13px", color: "#64748B", margin: 0, lineHeight: 1.5, textAlign: "left" },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  field: { display: "flex", flexDirection: "column", gap: "4px" },
  label: { fontSize: "12px", color: "#64748B", fontWeight: "500" },
  input: {
    padding: "10px 12px",
    fontSize: "15px",
    border: "1px solid #E2E8F0",
    borderRadius: "8px",
    outline: "none",
    background: "#fff",
    color: "#0F172A",
  },
  erro: {
    fontSize: "13px",
    color: "#DC2626",
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    borderRadius: "6px",
    padding: "8px 12px",
    margin: 0,
  },
  btn: {
    padding: "12px",
    background: "#0C447C",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
  },
  okBox: { textAlign: "center" },
  okText: { fontSize: "14px", color: "#0F172A", lineHeight: 1.5, margin: "0 0 16px" },
  linkBtn: {
    display: "inline-block",
    padding: "10px 20px",
    background: "#0C447C",
    color: "#fff",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    textDecoration: "none",
  },
  footer: { marginTop: "20px", textAlign: "center", marginBottom: 0 },
  link: { fontSize: "13px", color: "#0C447C", fontWeight: "600", textDecoration: "none" },
};

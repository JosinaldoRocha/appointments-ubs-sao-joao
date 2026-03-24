// src/pages/Login.jsx
import { useState } from "react";
import { loginComCpf, formatCpf, validateCpf } from "../services/auth";

export default function Login() {
  const [cpf, setCpf]         = useState("");
  const [senha, setSenha]     = useState("");
  const [erro, setErro]       = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    const cpfLimpo = cpf.replace(/\D/g, "");
    if (!validateCpf(cpfLimpo)) {
      setErro("CPF inválido.");
      return;
    }
    if (senha.length < 6) {
      setErro("Senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      await loginComCpf(cpfLimpo, senha);
      // onAuthChange no AuthProvider cuida do redirecionamento
    } catch (err) {
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        setErro("CPF ou senha incorretos.");
      } else if (err.code === "auth/user-not-found") {
        setErro("Usuário não encontrado.");
      } else {
        setErro("Erro ao entrar. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.bg}>
      <div style={styles.card}>
        <div style={styles.logoArea}>
          <div style={styles.logo}>+</div>
          <h1 style={styles.title}>UBS Agendamentos</h1>
          <p style={styles.sub}>Entre com seu CPF e senha</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>CPF</label>
            <input
              style={styles.input}
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              maxLength={14}
              autoComplete="username"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Senha</label>
            <input
              style={styles.input}
              type="password"
              placeholder="••••••••"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {erro && <p style={styles.erro}>{erro}</p>}

          <button style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p style={styles.hint}>
          Esqueceu sua senha? Fale com a recepção da unidade.
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
    maxWidth: "360px",
  },
  logoArea: { textAlign: "center", marginBottom: "28px" },
  logo: {
    width: "52px", height: "52px",
    background: "#E6F1FB", borderRadius: "14px",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "28px", color: "#0C447C", fontWeight: "700",
    margin: "0 auto 12px",
  },
  title: { fontSize: "20px", fontWeight: "600", color: "#0F172A", margin: "0 0 4px" },
  sub:   { fontSize: "13px", color: "#64748B", margin: 0 },
  form:  { display: "flex", flexDirection: "column", gap: "16px" },
  field: { display: "flex", flexDirection: "column", gap: "4px" },
  label: { fontSize: "12px", color: "#64748B", fontWeight: "500" },
  input: {
    padding: "10px 12px", fontSize: "15px",
    border: "1px solid #E2E8F0", borderRadius: "8px",
    outline: "none", background: "#fff", color: "#0F172A",
  },
  erro: {
    fontSize: "13px", color: "#DC2626",
    background: "#FEF2F2", border: "1px solid #FECACA",
    borderRadius: "6px", padding: "8px 12px", margin: 0,
  },
  btn: {
    padding: "12px",
    background: "#0C447C", color: "#fff",
    border: "none", borderRadius: "8px",
    fontSize: "15px", fontWeight: "600",
    cursor: "pointer",
  },
  hint: { fontSize: "12px", color: "#94A3B8", textAlign: "center", marginTop: "20px" },
};

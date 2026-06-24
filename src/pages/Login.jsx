// src/pages/Login.jsx
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppLogo from "../components/AppLogo";
import PasswordInput from "../components/PasswordInput";
import { loginComEmail } from "../services/auth";
import { useAuth, STORAGE_LOGOUT_SESSAO_RECEPCAO } from "../hooks/useAuth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [avisoSessao, setAvisoSessao] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_LOGOUT_SESSAO_RECEPCAO)) {
        sessionStorage.removeItem(STORAGE_LOGOUT_SESSAO_RECEPCAO);
        setAvisoSessao("Outro recepcionista entrou no sistema. Sua sessão foi encerrada.");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      navigate("/", { replace: true });
    }
  }, [authLoading, user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    const emailNorm = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      setErro("Informe um e-mail válido.");
      return;
    }
    if (senha.length < 6) {
      setErro("Senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      await loginComEmail(emailNorm, senha);
    } catch (err) {
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        setErro("E-mail ou senha incorretos.");
      } else if (err.code === "auth/user-not-found") {
        setErro("Usuário não encontrado.");
      } else {
        setErro("Erro ao entrar. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div style={styles.bg}>
        <p style={{ color: "#64748B", fontSize: 14 }}>Carregando...</p>
      </div>
    );
  }

  return (
    <div style={styles.bg}>
      <div style={styles.card}>
        <div style={styles.logoArea}>
          <AppLogo size={52} title="UBS Agendamentos" style={{ margin: "0 auto 12px" }} />
          <h1 style={styles.title}>UBS Agendamentos</h1>
          <p style={styles.sub}>Entre com o e-mail cadastrado pela recepção e sua senha</p>
        </div>

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
              autoComplete="username"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="login-senha">
              Senha
            </label>
            <PasswordInput
              id="login-senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              inputStyle={styles.input}
            />
          </div>

          {avisoSessao && (
            <p style={styles.avisoSessao} role="status">
              {avisoSessao}
            </p>
          )}
          {erro && <p style={styles.erro}>{erro}</p>}

          <button style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <Link to="/recuperar-senha" style={styles.btnRedefinir}>
          Redefinir senha
        </Link>
        <p style={styles.hint}>
          O link de redefinição é enviado só para o e-mail da sua conta.
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
    maxWidth: "380px",
    boxShadow: "0 8px 32px rgba(67,56,202,0.09), 0 2px 8px rgba(0,0,0,0.04)",
  },
  logoArea: { textAlign: "center", marginBottom: "28px" },
  title: { fontSize: "22px", fontWeight: "700", color: "#0F172A", margin: "0 0 6px", letterSpacing: "-0.02em" },
  sub: { fontSize: "13px", color: "#64748B", margin: 0, lineHeight: 1.5 },
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
  avisoSessao: {
    fontSize: "13px",
    color: "#92400E",
    background: "#FFFBEB",
    border: "1px solid #FDE68A",
    borderRadius: "8px",
    padding: "10px 13px",
    margin: 0,
    lineHeight: 1.5,
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
  btnRedefinir: {
    display: "block",
    width: "100%",
    marginTop: "12px",
    padding: "12px",
    fontSize: "14px",
    fontWeight: "600",
    textAlign: "center",
    textDecoration: "none",
    color: "#475569",
    background: "#F8FAFC",
    border: "1.5px solid #E2E8F0",
    borderRadius: "10px",
    outline: "none",
    boxSizing: "border-box",
  },
  hint: { fontSize: "12px", color: "#94A3B8", textAlign: "center", marginTop: "12px", lineHeight: 1.5 },
};

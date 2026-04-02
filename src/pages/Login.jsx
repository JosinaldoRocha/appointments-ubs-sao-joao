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
  title: { fontSize: "20px", fontWeight: "600", color: "#0F172A", margin: "0 0 4px" },
  sub: { fontSize: "13px", color: "#64748B", margin: 0 },
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
  avisoSessao: {
    fontSize: "13px",
    color: "#92400E",
    background: "#FFFBEB",
    border: "1px solid #FDE68A",
    borderRadius: "6px",
    padding: "8px 12px",
    margin: 0,
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
  btnRedefinir: {
    display: "block",
    width: "100%",
    marginTop: "12px",
    padding: "11px 12px",
    fontSize: "14px",
    fontWeight: "600",
    textAlign: "center",
    textDecoration: "none",
    color: "#0C447C",
    background: "#fff",
    border: "1px solid #CBD5E1",
    borderRadius: "8px",
    outline: "none",
    boxSizing: "border-box",
  },
  hint: { fontSize: "12px", color: "#94A3B8", textAlign: "center", marginTop: "10px", lineHeight: 1.45 },
};

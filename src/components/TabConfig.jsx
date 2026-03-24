// src/components/TabConfig.jsx
import { useState, useEffect } from "react";
import { getAllUsers, createUser, deleteUser, updateProfissional, listenSettings, updateSettings, listenAuditLog } from "../services/db";
import { cpfToEmail, formatCpf, validateCpf } from "../services/auth";
import { createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { DEFAULT_PROF_NAMES, SPEC_META, DEFAULT_PCCU_TOTAL } from "../services/scheduleConfig";

export default function TabConfig({ profNames, showToast }) {
  const [users, setUsers] = useState([]);
  const [section, setSection] = useState("profissionais");
  const [novoUser, setNovoUser] = useState({ nome: "", cpf: "", senha: "", role: "agente" });
  const [loading, setLoading] = useState(false);

  const [feriados, setFeriados] = useState([]);
  const [novoFeriado, setNovoFeriado] = useState("");
  const [fernandoFora, setFernandoFora] = useState(false);
  const [pccuTotal, setPccuTotal] = useState(DEFAULT_PCCU_TOTAL);
  const [savingRegras, setSavingRegras] = useState(false);

  const [auditRows, setAuditRows] = useState([]);

  useEffect(() => {
    getAllUsers().then(setUsers);
  }, []);

  useEffect(() => {
    const un = listenSettings((s) => {
      setFeriados(s.feriados || []);
      setFernandoFora(Boolean(s.fernandoForaUnidade));
      setPccuTotal(typeof s.pccuTotal === "number" ? s.pccuTotal : DEFAULT_PCCU_TOTAL);
    });
    return un;
  }, []);

  useEffect(() => {
    if (section !== "auditoria") return undefined;
    return listenAuditLog(setAuditRows, 120);
  }, [section]);

  async function salvarNomeProfissional(key, nome) {
    if (!nome.trim()) return;
    await updateProfissional(key, { nome });
    showToast(`Nome atualizado: ${nome}`, "success");
  }

  async function salvarRegras() {
    setSavingRegras(true);
    try {
      await updateSettings({
        feriados: [...feriados].sort(),
        fernandoForaUnidade: fernandoFora,
        pccuTotal: Math.max(1, Math.min(50, Number(pccuTotal) || DEFAULT_PCCU_TOTAL)),
      });
      showToast("Calendário e regras salvos.", "success");
    } catch {
      showToast("Erro ao salvar configurações.", "danger");
    } finally {
      setSavingRegras(false);
    }
  }

  function adicionarFeriado() {
    const v = (novoFeriado || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      showToast("Use a data no formato AAAA-MM-DD.", "danger");
      return;
    }
    if (feriados.includes(v)) {
      showToast("Esta data já está na lista.", "info");
      return;
    }
    setFeriados((f) => [...f, v].sort());
    setNovoFeriado("");
  }

  function removerFeriado(iso) {
    setFeriados((f) => f.filter((x) => x !== iso));
  }

  async function criarUsuario() {
    const cpfLimpo = novoUser.cpf.replace(/\D/g, "");
    if (!validateCpf(cpfLimpo)) {
      showToast("CPF inválido.", "danger");
      return;
    }
    if (!novoUser.nome.trim()) {
      showToast("Informe o nome.", "danger");
      return;
    }
    if (novoUser.senha.length < 6) {
      showToast("Senha precisa ter ao menos 6 caracteres.", "danger");
      return;
    }
    setLoading(true);
    try {
      const auth2 = getAuth();
      const email = cpfToEmail(cpfLimpo);
      const cred = await createUserWithEmailAndPassword(auth2, email, novoUser.senha);
      await createUser(cred.user.uid, {
        nome: novoUser.nome.trim(),
        cpf: cpfLimpo,
        role: novoUser.role,
        email,
      });
      setUsers(await getAllUsers());
      setNovoUser({ nome: "", cpf: "", senha: "", role: "agente" });
      showToast("Usuário criado com sucesso!", "success");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") showToast("CPF já cadastrado.", "danger");
      else showToast("Erro ao criar usuário.", "danger");
    } finally {
      setLoading(false);
    }
  }

  async function excluirUsuario(uid) {
    if (!window.confirm("Excluir este usuário?")) return;
    await deleteUser(uid);
    setUsers((u) => u.filter((x) => x.id !== uid));
    showToast("Usuário excluído.", "info");
  }

  const roleLabel = { agente: "Agente de saúde", recepcao: "Recepcionista", diretor: "Direção" };

  const tabs = [
    { key: "profissionais", label: "Profissionais" },
    { key: "calendario", label: "Calendário & regras" },
    { key: "usuarios", label: "Usuários" },
    { key: "auditoria", label: "Histórico" },
  ];

  return (
    <div>
      <div style={S.tabs}>
        {tabs.map((t) => (
          <button
            key={t.key}
            style={{ ...S.stab, ...(section === t.key ? S.stabActive : {}) }}
            onClick={() => setSection(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {section === "profissionais" && (
        <div>
          <p style={S.hint}>Altere o nome quando um profissional for substituído na unidade.</p>
          {Object.keys(DEFAULT_PROF_NAMES).map((key) => (
            <ProfRow key={key} specKey={key} nome={profNames[key] || DEFAULT_PROF_NAMES[key]} onSave={salvarNomeProfissional} />
          ))}
        </div>
      )}

      {section === "calendario" && (
        <div>
          <p style={S.hint}>
            Feriados em que a UBS não agenda: o sistema usa o último dia útil antes do atendimento
            como dia de abertura da agenda (pulando fins de semana e estas datas).
          </p>

          <p style={S.sectionTitle}>Feriados (AAAA-MM-DD)</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <input
              type="date"
              style={S.input}
              value={novoFeriado}
              onChange={(e) => setNovoFeriado(e.target.value)}
            />
            <button type="button" style={S.btnSave} onClick={adicionarFeriado}>
              Adicionar
            </button>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
            {feriados.map((iso) => (
              <li key={iso} style={S.feriadoRow}>
                <span>{new Date(iso + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                <button type="button" style={S.btnDel} onClick={() => removerFeriado(iso)}>
                  Remover
                </button>
              </li>
            ))}
            {feriados.length === 0 && (
              <li style={{ fontSize: 12, color: "#94A3B8" }}>Nenhum feriado cadastrado.</li>
            )}
          </ul>

          <label style={S.checkRow}>
            <input
              type="checkbox"
              checked={fernandoFora}
              onChange={(e) => setFernandoFora(e.target.checked)}
            />
            <span>
              Dr. Fernando fora da unidade (atendimento domiciliar / quinzena) — oculta vagas de
              odontologia dele.
            </span>
          </label>

          <div style={{ marginTop: 14 }}>
            <label style={S.label}>Vagas PCCU (quarta-feira manhã — exclusivo exame)</label>
            <input
              type="number"
              min={1}
              max={50}
              style={{ ...S.input, maxWidth: 120, marginTop: 4 }}
              value={pccuTotal}
              onChange={(e) => setPccuTotal(Number(e.target.value))}
            />
          </div>

          <button
            type="button"
            style={{ ...S.btnAdd, marginTop: 18, opacity: savingRegras ? 0.6 : 1 }}
            disabled={savingRegras}
            onClick={salvarRegras}
          >
            {savingRegras ? "Salvando..." : "Salvar calendário e regras"}
          </button>
        </div>
      )}

      {section === "usuarios" && (
        <div>
          <p style={S.sectionTitle}>Novo usuário</p>
          <div style={S.formGrid}>
            <Field label="Nome completo">
              <input
                style={S.input}
                value={novoUser.nome}
                onChange={(e) => setNovoUser((u) => ({ ...u, nome: e.target.value }))}
                placeholder="Nome do usuário"
              />
            </Field>
            <Field label="CPF">
              <input
                style={S.input}
                value={novoUser.cpf}
                onChange={(e) => setNovoUser((u) => ({ ...u, cpf: formatCpf(e.target.value) }))}
                placeholder="000.000.000-00"
                maxLength={14}
                inputMode="numeric"
              />
            </Field>
            <Field label="Senha inicial">
              <input
                style={S.input}
                type="password"
                value={novoUser.senha}
                onChange={(e) => setNovoUser((u) => ({ ...u, senha: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
              />
            </Field>
            <Field label="Perfil">
              <select
                style={S.input}
                value={novoUser.role}
                onChange={(e) => setNovoUser((u) => ({ ...u, role: e.target.value }))}
              >
                <option value="agente">Agente de saúde</option>
                <option value="recepcao">Recepcionista</option>
                <option value="diretor">Direção</option>
              </select>
            </Field>
          </div>
          <button style={{ ...S.btnAdd, opacity: loading ? 0.6 : 1 }} disabled={loading} onClick={criarUsuario}>
            {loading ? "Criando..." : "Criar usuário"}
          </button>

          <p style={{ ...S.sectionTitle, marginTop: 20 }}>Usuários cadastrados</p>
          {users.map((u) => (
            <div key={u.id} style={S.userRow}>
              <div style={S.userAvatar}>{u.nome?.[0]?.toUpperCase() || "?"}</div>
              <div style={{ flex: 1 }}>
                <p style={S.userName}>{u.nome}</p>
                <p style={S.userDetail}>
                  CPF: {u.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")} ·{" "}
                  {roleLabel[u.role] || u.role}
                </p>
              </div>
              <button style={S.btnDel} onClick={() => excluirUsuario(u.id)}>
                Excluir
              </button>
            </div>
          ))}
        </div>
      )}

      {section === "auditoria" && (
        <div>
          <p style={S.hint}>
            Registro das alterações de vagas e recusas feitas por recepcionistas (últimos eventos).
          </p>
          {auditRows.length === 0 && <p style={{ color: "#94A3B8", fontSize: 13 }}>Nenhum registro ainda.</p>}
          {auditRows.map((row) => (
            <AuditRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function AuditRow({ row }) {
  const ts =
    row.criadoEm?.toDate?.()?.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) || "—";
  return (
    <div style={S.auditCard}>
      <p style={S.auditTipo}>{row.tipo || "evento"}</p>
      <p style={S.auditDet}>{row.detalhe}</p>
      <p style={S.auditMeta}>
        {row.usuarioNome || "?"} · {ts}
      </p>
    </div>
  );
}

function ProfRow({ specKey, nome, onSave }) {
  const [val, setVal] = useState(nome);
  const meta = SPEC_META[specKey] || {};
  useEffect(() => setVal(nome), [nome]);
  return (
    <div style={S.profRow}>
      <div style={{ ...S.avSmall, background: meta.bg || "#F1F5F9", color: meta.tc || "#475569" }}>
        {meta.av || "?"}
      </div>
      <div style={{ flex: 1 }}>
        <p style={S.profRole}>{meta.role || specKey}</p>
        <input style={S.input} value={val} onChange={(e) => setVal(e.target.value)} />
      </div>
      <button style={S.btnSave} onClick={() => onSave(specKey, val)}>
        Salvar
      </button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={S.fieldWrap}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

const S = {
  tabs: { display: "flex", gap: 4, marginBottom: 16, background: "#F1F5F9", borderRadius: 8, padding: 4, flexWrap: "wrap" },
  stab: { flex: 1, padding: "6px 10px", fontSize: 12, border: "none", borderRadius: 6, cursor: "pointer", background: "transparent", color: "#64748B", minWidth: 0 },
  stabActive: { background: "#fff", color: "#0F172A", fontWeight: 600 },
  hint: { fontSize: 13, color: "#64748B", marginBottom: 12, lineHeight: 1.45 },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: "#0F172A", margin: "0 0 10px" },
  profRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  avSmall: { width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 },
  profRole: { fontSize: 11, color: "#64748B", margin: "0 0 4px" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 12 },
  fieldWrap: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 12, color: "#64748B", fontWeight: 500 },
  input: { padding: "7px 9px", fontSize: 13, border: "1px solid #E2E8F0", borderRadius: 8, background: "#fff", color: "#0F172A", outline: "none" },
  btnAdd: { padding: "9px 18px", fontSize: 13, fontWeight: 600, border: "none", borderRadius: 8, cursor: "pointer", background: "#0C447C", color: "#fff" },
  userRow: { display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "#F8FAFC", borderRadius: 8, marginBottom: 6 },
  userAvatar: { width: 32, height: 32, borderRadius: "50%", background: "#DBEAFE", color: "#1E40AF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600 },
  userName: { fontSize: 13, fontWeight: 600, color: "#0F172A", margin: 0 },
  userDetail: { fontSize: 11, color: "#64748B", margin: 0 },
  btnSave: { padding: "5px 12px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", background: "#DCFCE7", color: "#166534" },
  btnDel: { padding: "5px 10px", fontSize: 11, border: "none", borderRadius: 6, cursor: "pointer", background: "#FEE2E2", color: "#991B1B" },
  feriadoRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "#fff", borderRadius: 6, marginBottom: 4, border: "0.5px solid #E2E8F0", fontSize: 13 },
  checkRow: { display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "#334155", cursor: "pointer", marginTop: 8 },
  auditCard: { padding: "10px 12px", background: "#fff", borderRadius: 8, border: "0.5px solid #E2E8F0", marginBottom: 8 },
  auditTipo: { fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", margin: "0 0 4px" },
  auditDet: { fontSize: 13, color: "#0F172A", margin: 0 },
  auditMeta: { fontSize: 11, color: "#94A3B8", margin: "6px 0 0" },
};

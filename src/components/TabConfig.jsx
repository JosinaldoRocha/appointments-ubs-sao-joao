// src/components/TabConfig.jsx
import { useState, useEffect } from "react";
import {
  getAllUsers,
  createUser,
  deleteUser,
  updateProfissional,
  createProfissional,
  deleteProfissional,
  listenSettings,
  updateSettings,
  updateUser,
} from "../services/db";
import { formatCpf, validateCpf, formatTelefoneBR } from "../services/auth";
import {
  createUserWithEmailAndPassword,
  signOut,
  deleteUser as deleteAuthUser,
} from "firebase/auth";
import { secondaryAuth } from "../services/firebase";
import {
  DEFAULT_PROF_NAMES,
  SPEC_META,
  DEFAULT_PCCU_TOTAL,
  parseDateStr,
  normalizeFeriadosList,
} from "../services/scheduleConfig";
import PasswordInput from "./PasswordInput";

/**
 * Localiza o documento em `profissionais` para a chave da agenda, mesmo sem campo `specKey`
 * (ex.: ID automático). Grava `specKey` no próximo update para amarrar de vez ao Firestore.
 */
function resolverDocumentoProfissional(specKey, profissionaisMap) {
  const list = Object.values(profissionaisMap || {});
  const direct = list.find((p) => p.specKey === specKey || p.id === specKey);
  if (direct) return direct;

  const meta = SPEC_META[specKey];
  const defaultNome = DEFAULT_PROF_NAMES[specKey];
  if (!meta?.role) return null;

  const sameRole = list.filter((p) => p.role === meta.role);
  if (sameRole.length === 1) return sameRole[0];

  if (defaultNome && sameRole.length > 0) {
    const d = defaultNome.trim().toLowerCase();
    const byNome = sameRole.find((p) => (p.nome || "").trim().toLowerCase() === d);
    if (byNome) return byNome;
  }

  if (sameRole.length > 1 && meta.role === "Odontologia") {
    if (specKey === "dentFernando") {
      const f = sameRole.find((p) => /fernando/i.test(p.nome || ""));
      if (f) return f;
    }
    if (specKey === "dentPatrick") {
      const f = sameRole.find((p) => /patrick/i.test(p.nome || ""));
      if (f) return f;
    }
  }

  return null;
}

export default function TabConfig({ profNames, profissionaisMap = {}, showToast, isRecepcao }) {
  const [users, setUsers] = useState([]);
  const [section, setSection] = useState("profissionais");
  const [novoUser, setNovoUser] = useState({
    nome: "",
    cpf: "",
    telefone: "",
    email: "",
    senha: "",
    rule: "agente",
  });
  const [loading, setLoading] = useState(false);

  const [feriados, setFeriados] = useState([]);
  const [novoFeriado, setNovoFeriado] = useState("");
  const [pontosFacultativos, setPontosFacultativos] = useState([]);
  const [novoPontoFacultativo, setNovoPontoFacultativo] = useState("");
  const [pccuTotal, setPccuTotal] = useState(DEFAULT_PCCU_TOTAL);
  /** Primeira quarta: a partir dela, visitas domiciliares em quinzena (Dr. Fernando). */
  const [dentQuartaVisitaDomiciliarDesde, setDentQuartaVisitaDomiciliarDesde] = useState("");
  const [savingRegras, setSavingRegras] = useState(false);

  useEffect(() => {
    getAllUsers().then(setUsers);
  }, []);

  useEffect(() => {
    const un = listenSettings((s) => {
      setFeriados(s.feriados || []);
      setPontosFacultativos(s.pontosFacultativos || []);
      setPccuTotal(typeof s.pccuTotal === "number" ? s.pccuTotal : DEFAULT_PCCU_TOTAL);
      setDentQuartaVisitaDomiciliarDesde(
        typeof s.dentQuartaVisitaDomiciliarDesde === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(s.dentQuartaVisitaDomiciliarDesde.trim())
          ? s.dentQuartaVisitaDomiciliarDesde.trim()
          : ""
      );
    });
    return un;
  }, []);

  async function salvarNomeProfissional(specKey, nome) {
    const n = nome.trim();
    if (!n) {
      showToast("Informe o nome do profissional.", "danger");
      return;
    }
    const role = SPEC_META[specKey]?.role;
    const existente = resolverDocumentoProfissional(specKey, profissionaisMap);
    try {
      if (existente?.id) {
        await updateProfissional(existente.id, { nome: n, specKey });
        showToast(`Profissional atualizado: ${n}`, "success");
      } else {
        await createProfissional({
          nome: n,
          specKey,
          ...(role ? { role } : {}),
        });
        showToast(`Profissional cadastrado: ${n}`, "success");
      }
    } catch {
      showToast("Erro ao salvar o profissional.", "danger");
    }
  }

  async function excluirProfissional(specKey) {
    const d = resolverDocumentoProfissional(specKey, profissionaisMap);
    if (!d?.id) {
      showToast("Não há cadastro no Firestore para excluir nesta linha.", "info");
      return;
    }
    if (
      !window.confirm(
        "Excluir este profissional do cadastro? O nome nas vagas volta ao padrão da unidade."
      )
    ) {
      return;
    }
    try {
      await deleteProfissional(d.id);
      showToast("Profissional excluído. Nome padrão restaurado.", "info");
    } catch {
      showToast("Erro ao excluir o profissional.", "danger");
    }
  }

  async function salvarRegras() {
    const vVisita = (dentQuartaVisitaDomiciliarDesde || "").trim();
    if (vVisita) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(vVisita)) {
        showToast("Data de visitas domiciliares inválida (use AAAA-MM-DD).", "danger");
        return;
      }
      if (parseDateStr(vVisita).getDay() !== 3) {
        showToast("Selecione uma quarta-feira como data de início.", "danger");
        return;
      }
    }

    setSavingRegras(true);
    try {
      await updateSettings({
        feriados: normalizeFeriadosList(feriados),
        pontosFacultativos: normalizeFeriadosList(pontosFacultativos),
        pccuTotal: Math.max(1, Math.min(50, Number(pccuTotal) || DEFAULT_PCCU_TOTAL)),
        dentQuartaVisitaDomiciliarDesde: vVisita,
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

  function adicionarPontoFacultativo() {
    const v = (novoPontoFacultativo || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      showToast("Use a data no formato AAAA-MM-DD.", "danger");
      return;
    }
    if (pontosFacultativos.includes(v)) {
      showToast("Esta data já está na lista.", "info");
      return;
    }
    setPontosFacultativos((f) => [...f, v].sort());
    setNovoPontoFacultativo("");
  }

  function removerPontoFacultativo(iso) {
    setPontosFacultativos((f) => f.filter((x) => x !== iso));
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
    const emailLogin = (novoUser.email || "").trim().toLowerCase();
    if (!isEmailLoginValido(emailLogin)) {
      showToast("Informe um e-mail de login válido.", "danger");
      return;
    }
    if (novoUser.senha.length < 6) {
      showToast("Senha precisa ter ao menos 6 caracteres.", "danger");
      return;
    }
    if (users.some((x) => x.cpf === cpfLimpo)) {
      showToast("CPF já cadastrado.", "danger");
      return;
    }
    const telDigits = novoUser.telefone.replace(/\D/g, "");
    if (telDigits.length > 0 && telDigits.length < 10) {
      showToast("Telefone inválido (use DDD + número, 10 ou 11 dígitos).", "danger");
      return;
    }
    setLoading(true);
    let cred = null;
    try {
      // Authentication: conta com e-mail/senha (mesmo Firebase project)
      cred = await createUserWithEmailAndPassword(secondaryAuth, emailLogin, novoUser.senha);
      // Firestore: coleção `usuarios` com o mesmo uid do Auth
      await createUser(cred.user.uid, {
        nome: novoUser.nome.trim(),
        cpf: cpfLimpo,
        rule: novoUser.rule,
        email: emailLogin,
        ...(telDigits.length >= 10 ? { telefone: telDigits } : {}),
      });
      setUsers(await getAllUsers());
      setNovoUser({ nome: "", cpf: "", telefone: "", email: "", senha: "", rule: "agente" });
      showToast("Usuário criado com sucesso.", "success");
    } catch (err) {
      if (cred?.user) {
        try {
          await deleteAuthUser(cred.user);
        } catch {
          /* evita conta só no Auth sem documento em usuarios */
        }
      }
      const code = err?.code;
      if (code === "auth/email-already-in-use") {
        showToast("Este e-mail já está em uso em outra conta.", "danger");
      } else if (code === "auth/weak-password") {
        showToast("Senha muito fraca. Use ao menos 6 caracteres.", "danger");
      } else if (code === "auth/invalid-email") {
        showToast("E-mail inválido.", "danger");
      } else if (code === "auth/network-request-failed") {
        showToast("Erro ao tentar criar o usuário: verifique a conexão.", "danger");
      } else if (code === "permission-denied") {
        showToast("Sem permissão para salvar o cadastro no Firestore.", "danger");
      } else {
        showToast("Erro ao tentar criar o usuário (Authentication ou Firestore). Tente novamente.", "danger");
      }
    } finally {
      try {
        await signOut(secondaryAuth);
      } catch {
        /* sessão secundária pode já estar limpa */
      }
      setLoading(false);
    }
  }

  async function excluirUsuario(uid) {
    if (!window.confirm("Excluir este usuário? Ele será removido do login e do cadastro.")) return;
    try {
      await deleteUser(uid);
      setUsers((u) => u.filter((x) => x.id !== uid));
      showToast("Usuário excluído.", "info");
    } catch (err) {
      const code = err?.code;
      const msg =
        code === "functions/not-found"
          ? "Função indisponível. Faça deploy: firebase deploy --only functions"
          : err?.message || "Erro ao excluir usuário.";
      showToast(msg, "danger");
    }
  }

  const ruleLabel = { agente: "Agente de saúde", recepcao: "Recepcionista", diretor: "Direção" };

  const tabs = [
    { key: "profissionais", label: "Profissionais" },
    { key: "calendario", label: "Calendário & regras" },
    { key: "usuarios", label: "Usuários" },
  ];

  if (!isRecepcao) return null;

  return (
    <div>
      <div style={S.configHeader}>
        <h2 style={S.configTitle}>Configuração da unidade</h2>
        <p style={S.configSub}>
          Só recepcionista acessa esta área. Use as abas abaixo: <strong>Profissionais</strong> para o
          nome em cada vaga da agenda; <strong>Usuários</strong> para criar ou excluir contas de login
          (agente, recepção, direção).
        </p>
      </div>

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
          <p style={S.hint}>
            <strong>Profissionais nas vagas da agenda</strong> — cada linha corresponde a uma{" "}
            <em>chave de agenda</em> do sistema (médico, odontologia, etc.). Use{" "}
            <strong>Salvar</strong> para cadastrar ou atualizar o nome; <strong>Excluir</strong> remove o
            cadastro no Firestore e o nome volta ao padrão. A grade de horários (dias e quantidade de vagas)
            continua definida no código (<code style={S.code}>scheduleConfig</code>).
          </p>
          <p style={S.hintMuted}>
            Para <strong>contas de login</strong> (agente, recepção, direção), use a aba{" "}
            <button type="button" style={S.linkTab} onClick={() => setSection("usuarios")}>
              Usuários
            </button>
            .
          </p>
          <hr style={S.sectionDivider} />
          {Object.keys(DEFAULT_PROF_NAMES).map((key, i, keys) => {
            const isFirst = i === 0;
            const isLast = i === keys.length - 1;
            return (
              <div
                key={key}
                style={{
                  ...S.profBlock,
                  ...(isFirst ? S.profBlockFirst : {}),
                  ...(isLast ? S.profBlockLast : {}),
                }}
              >
                <ProfRow
                  specKey={key}
                  nome={profNames[key] || DEFAULT_PROF_NAMES[key]}
                  doc={resolverDocumentoProfissional(key, profissionaisMap)}
                  onSave={salvarNomeProfissional}
                  onDelete={excluirProfissional}
                />
              </div>
            );
          })}
        </div>
      )}

      {section === "calendario" && (
        <div>
          <p style={S.hint}>
            Feriados e pontos facultativos em que a UBS não agenda: o sistema usa o último dia útil antes
            do atendimento como dia de abertura da agenda (pulando fins de semana e estas datas).
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

          <hr style={S.sectionDivider} />

          <p style={S.sectionTitle}>Pontos facultativos (AAAA-MM-DD)</p>
          <p style={S.hintMuted}>
            Mesma regra dos feriados: sem atendimento agendado na data; o dia útil anterior ao atendimento
            continua sendo usado para abrir a agenda.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, marginTop: 8 }}>
            <input
              type="date"
              style={S.input}
              value={novoPontoFacultativo}
              onChange={(e) => setNovoPontoFacultativo(e.target.value)}
            />
            <button type="button" style={S.btnSave} onClick={adicionarPontoFacultativo}>
              Adicionar
            </button>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
            {pontosFacultativos.map((iso) => (
              <li key={iso} style={S.feriadoRow}>
                <span>{new Date(iso + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                <button type="button" style={S.btnDel} onClick={() => removerPontoFacultativo(iso)}>
                  Remover
                </button>
              </li>
            ))}
            {pontosFacultativos.length === 0 && (
              <li style={{ fontSize: 12, color: "#94A3B8" }}>Nenhum ponto facultativo cadastrado.</li>
            )}
          </ul>

          <hr style={S.sectionDivider} />

          <div>
            <p style={S.sectionTitle}>Odontologia — visitas domiciliares (quartas)</p>
            <p style={S.hintMuted}>
              Escolha uma <strong>quarta-feira</strong> de início. A partir dela, a cada <strong>15 dias</strong>{" "}
              (quinzenal: <strong>uma quarta sim, outra não</strong>) a manhã fica{" "}
              <strong>reservada para visitas domiciliares</strong> (sem vagas na unidade nesse turno). No{" "}
              <strong>dia anterior</strong> a cada quarta de visitas, agentes de saúde e direção veem um aviso no
              sistema. Altere ou limpe a data quando precisar.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
              <label style={{ ...S.label, margin: 0 }}>Primeira quarta (início)</label>
              <input
                type="date"
                style={S.input}
                value={dentQuartaVisitaDomiciliarDesde}
                onChange={(e) => setDentQuartaVisitaDomiciliarDesde(e.target.value)}
              />
              <button
                type="button"
                style={S.btnDel}
                onClick={() => setDentQuartaVisitaDomiciliarDesde("")}
              >
                Desativar regra
              </button>
            </div>
          </div>

          <hr style={S.sectionDivider} />

          <div>
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

          <hr style={S.sectionDivider} />

          <button
            type="button"
            style={{ ...S.btnAdd, marginTop: 0, opacity: savingRegras ? 0.6 : 1 }}
            disabled={savingRegras}
            onClick={salvarRegras}
          >
            {savingRegras ? "Salvando..." : "Salvar calendário e regras"}
          </button>
        </div>
      )}

      {section === "usuarios" && (
        <div>
          <p style={S.hint}>
            <strong>Contas de acesso ao sistema</strong> — crie ou exclua usuários (CPF para identificação,
            <strong> e-mail</strong> como login no app e no Firebase, senha inicial). Para redefinir senha,
            todos usam o botão <strong>Redefinir senha</strong> na tela de login. Isso é independente dos nomes
            nas vagas da aba Profissionais.
          </p>
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
            <Field label="Telefone">
              <input
                style={S.input}
                value={novoUser.telefone}
                onChange={(e) => setNovoUser((u) => ({ ...u, telefone: formatTelefoneBR(e.target.value) }))}
                placeholder="(00) 00000-0000"
                maxLength={16}
                inputMode="numeric"
                autoComplete="tel"
              />
            </Field>
            <Field label="E-mail de login">
              <input
                style={S.input}
                type="email"
                autoComplete="off"
                value={novoUser.email}
                onChange={(e) => setNovoUser((u) => ({ ...u, email: e.target.value }))}
                placeholder="seu@email.com"
              />
            </Field>
            <Field label="Senha inicial">
              <PasswordInput
                compact
                value={novoUser.senha}
                onChange={(e) => setNovoUser((u) => ({ ...u, senha: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                inputStyle={S.input}
              />
            </Field>
            <Field label="Perfil">
              <select
                style={S.input}
                value={novoUser.rule}
                onChange={(e) => setNovoUser((u) => ({ ...u, rule: e.target.value }))}
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

          <hr style={S.sectionDivider} />

          <p style={{ ...S.sectionTitle, marginTop: 0 }}>Usuários cadastrados</p>
          {users.map((u) => (
            <div key={u.id}>
              <div style={S.userRow}>
                <div style={S.userAvatar}>{u.nome?.[0]?.toUpperCase() || "?"}</div>
                <div style={{ flex: 1 }}>
                  <p style={S.userName}>{u.nome}</p>
                  <p style={S.userDetail}>
                    CPF: {u.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")} ·{" "}
                    {ruleLabel[u.rule] || u.rule || ruleLabel[u.role] || u.role}
                    {u.email ? (
                      <>
                        {" "}
                        · Login: {u.email}
                      </>
                    ) : null}
                    {u.telefone ? (
                      <>
                        {" "}
                        · Tel.: {formatTelefoneBR(u.telefone)}
                      </>
                    ) : null}
                  </p>
                </div>
                <button style={S.btnDel} onClick={() => excluirUsuario(u.id)}>
                  Excluir
                </button>
              </div>
              {(u.rule === "recepcao" || u.role === "recepcao") && (
                <RecepcionistaWhatsappRow
                  usuario={u}
                  showToast={showToast}
                  onSaved={async () => setUsers(await getAllUsers())}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function isEmailLoginValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function RecepcionistaWhatsappRow({ usuario, showToast, onSaved }) {
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = String(usuario.telefoneWhatsapp || "").replace(/\D/g, "").slice(0, 11);
    if (!d) {
      setVal("");
      return;
    }
    const f =
      d.length <= 10
        ? d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3")
        : d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
    setVal(f);
  }, [usuario.id, usuario.telefoneWhatsapp]);

  function handleChange(v) {
    const d = v.replace(/\D/g, "").slice(0, 11);
    const f =
      d.length <= 10
        ? d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3")
        : d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
    setVal(f);
  }

  async function salvar() {
    const digits = val.replace(/\D/g, "");
    if (digits.length < 10) {
      showToast("Informe um WhatsApp válido (DDD + número).", "danger");
      return;
    }
    setSaving(true);
    try {
      await updateUser(usuario.id, { telefoneWhatsapp: digits });
      await onSaved();
      showToast("WhatsApp da recepção salvo. Agentes e direção usam este número ao enviar pedidos pelo WhatsApp.", "success");
    } catch {
      showToast("Erro ao salvar WhatsApp.", "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={S.waRow}>
      <span style={S.waLabel}>WhatsApp da recepção (pedidos de agendamento)</span>
      <div style={S.waInputs}>
        <input
          style={{ ...S.input, flex: 1, minWidth: 140 }}
          value={val}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="(99) 99999-9999"
          inputMode="numeric"
        />
        <button type="button" style={S.btnSave} disabled={saving} onClick={salvar}>
          {saving ? "…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}

function ProfRow({ specKey, nome, doc, onSave, onDelete }) {
  const [val, setVal] = useState(nome);
  const meta = SPEC_META[specKey] || {};
  useEffect(() => setVal(nome), [nome]);
  const temCadastro = Boolean(doc?.id);
  return (
    <div style={S.profRow}>
      <div style={{ ...S.avSmall, background: meta.bg || "#F1F5F9", color: meta.tc || "#475569" }}>
        {meta.av || "?"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={S.profRole}>{meta.role || specKey}</p>
        <input style={S.input} value={val} onChange={(e) => setVal(e.target.value)} />
        {!temCadastro && (
          <p style={S.profHintMuted}>Sem cadastro no Firestore — Salvar cria o registro.</p>
        )}
      </div>
      <div style={S.profActions}>
        <button type="button" style={S.btnSave} onClick={() => onSave(specKey, val)}>
          {temCadastro ? "Salvar" : "Cadastrar"}
        </button>
        <button
          type="button"
          style={{ ...S.btnDel, opacity: temCadastro ? 1 : 0.45 }}
          disabled={!temCadastro}
          title={temCadastro ? "Excluir cadastro" : "Nada para excluir"}
          onClick={() => onDelete(specKey)}
        >
          Excluir
        </button>
      </div>
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
  configHeader: { marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid #E2E8F0" },
  configTitle: { fontSize: 17, fontWeight: 700, color: "#0F172A", margin: "0 0 8px" },
  configSub: { fontSize: 13, color: "#475569", margin: 0, lineHeight: 1.5 },
  tabs: { display: "flex", gap: 4, marginBottom: 16, background: "#F1F5F9", borderRadius: 8, padding: 4, flexWrap: "wrap" },
  stab: { flex: 1, padding: "8px 12px", fontSize: 12, border: "none", borderRadius: 6, cursor: "pointer", background: "transparent", color: "#64748B", minWidth: 0 },
  stabActive: { background: "#fff", color: "#0F172A", fontWeight: 600, boxShadow: "0 1px 2px rgba(15,23,42,0.06)" },
  hint: { fontSize: 13, color: "#64748B", marginBottom: 12, lineHeight: 1.45 },
  hintMuted: { fontSize: 12, color: "#94A3B8", marginBottom: 14, lineHeight: 1.45 },
  code: { fontSize: 11, background: "#F1F5F9", padding: "1px 5px", borderRadius: 4, color: "#0F172A" },
  linkTab: {
    font: "inherit",
    fontWeight: 600,
    color: "#0C447C",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textDecoration: "underline",
  },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: "#0F172A", margin: "0 0 10px" },
  /** Separador visual entre blocos dentro de cada aba de Config. */
  sectionDivider: {
    border: "none",
    borderTop: "1px solid #E2E8F0",
    margin: "20px 0",
    height: 0,
  },
  profBlock: {
    borderBottom: "1px solid #E2E8F0",
    paddingTop: 16,
    paddingBottom: 16,
  },
  profBlockFirst: { paddingTop: 0 },
  profBlockLast: { borderBottom: "none", paddingBottom: 0 },
  profRow: { display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 0 },
  profActions: { display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 },
  profHintMuted: { fontSize: 11, color: "#94A3B8", margin: "6px 0 0" },
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
  waRow: {
    margin: "-4px 0 10px 42px",
    padding: "8px 10px",
    background: "#F8FAFC",
    borderRadius: 8,
    border: "0.5px solid #E2E8F0",
  },
  waLabel: { display: "block", fontSize: 11, fontWeight: 600, color: "#64748B", marginBottom: 6 },
  waHint: { fontSize: 11, color: "#94A3B8", margin: "0 0 8px", lineHeight: 1.35 },
  waInputs: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
};

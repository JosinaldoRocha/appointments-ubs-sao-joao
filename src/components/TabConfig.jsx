// src/components/TabConfig.jsx
import { useState, useEffect, useMemo } from "react";
import {
  getAllUsers,
  createUser,
  deleteUser,
  updateProfissional,
  createProfissional,
  createProfissionalComSpecKeyCustom,
  deleteProfissionalComRelacionados,
  restaurarSpecKeyNaAgenda,
  patchProfissionalConfigPorSpec,
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
import { deleteField } from "firebase/firestore";
import {
  DEFAULT_PROF_NAMES,
  SPEC_META,
  DEFAULT_PCCU_TOTAL,
  parseDateStr,
  normalizeFeriadosList,
  ORDEM_DIA_SEMANA_GRADE,
  DAY_LABEL,
  defaultAtendimentoDiasTurnosParaSpec,
  normalizeAtendimentoDiasTurnosParaSpec,
  filtrarSpecKeysAtivos,
  specKeyEstaDesativado,
  AGENDA_MODO,
  AGENDA_MODO_OPCOES,
  defaultAgendaModoParaSpec,
  defaultDiasAgendamentoParaSpec,
  defaultDiasAgendamentoPresencialParaSpec,
  getSessionDefsForSpecKey,
  getSpecMetaForKey,
  isModoDiasAgendamento,
  isSpecKeyCustom,
  listaSpecKeysCustom,
  MEDICO_TIPO,
  medicoSessoesEfetivas,
  normalizeMedicoSessoesConfig,
  defaultMedicoSessoesFromBaseSchedule,
  gradeMapFromMedicoSessoes,
  medicoTemSessoesConfiguradasNoFirestore,
  ENFERMEIRA_ATENDIMENTO_TIPO,
  enfermeiraSessoesEfetivas,
  normalizeEnfermeiraSessoesConfig,
  gradeMapFromEnfermeiraSessoes,
  normalizarAgendaModo,
  normalizeDiasAgendamentoLista,
  normalizePainelVagasSpecKeys,
  PAINEL_VAGAS_MAX_PROFISSIONAIS,
} from "../services/scheduleConfig";
import PasswordInput from "./PasswordInput";

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

const ROLES_SUGERIDAS = [
  "Clínico Geral",
  "Odontologia",
  "Psicologia",
  "Fisioterapia",
  "Enfermagem",
  "Téc. Enfermagem",
  "Nutrição",
  "Pediatria",
  "Outro",
];

function montarPatchProfissionalConfig(
  specKey,
  {
    agendaModo,
    vagasPorTipo,
    vagasBase,
    role,
    isCustom,
    diasAgendamento,
    diasAgendamentoPresencial,
    medicoSessoes,
    enfermeiraSessoes,
  }
) {
  const usaSessoesConfig =
    specKey === "medico" || specKey === "enfermeira" || isCustom;
  const defs = usaSessoesConfig ? [] : getSessionDefsForSpecKey(specKey);
  const defModo = isCustom ? AGENDA_MODO.DIA_UTIL_ANTERIOR : defaultAgendaModoParaSpec(specKey);
  const entry = {};
  if (isCustom && role?.trim()) entry.role = role.trim();

  const modo = normalizarAgendaModo(agendaModo || AGENDA_MODO.PADRAO);
  if (isModoDiasAgendamento(modo)) {
    entry.agendaModo = AGENDA_MODO.DIAS_AGENDAMENTO;
    const dias = normalizeDiasAgendamentoLista(diasAgendamento);
    if (dias.length) entry.diasAgendamento = dias;
    const diasPres = normalizeDiasAgendamentoLista(diasAgendamentoPresencial);
    if (diasPres.length) entry.diasAgendamentoPresencial = diasPres;
    else entry.diasAgendamentoPresencial = deleteField();
  } else if (modo !== AGENDA_MODO.PADRAO && modo !== defModo) {
    entry.agendaModo = modo;
    entry.diasAgendamento = deleteField();
    entry.diasAgendamentoPresencial = deleteField();
  }

  if (specKey === "medico" && Array.isArray(medicoSessoes)) {
    const sessoes = normalizeMedicoSessoesConfig(medicoSessoes);
    if (sessoes.length) entry.sessoes = sessoes;
  }
  if (specKey === "enfermeira" && Array.isArray(enfermeiraSessoes)) {
    const sessoes = normalizeEnfermeiraSessoesConfig(enfermeiraSessoes);
    if (sessoes.length) entry.sessoes = sessoes;
  }

  if (specKey !== "medico" && specKey !== "enfermeira" && isCustom) {
    const vb = Number(vagasBase);
    if (Number.isFinite(vb) && vb >= 0) entry.vagasBase = Math.round(vb);
  } else if (defs.length > 0 && vagasPorTipo && typeof vagasPorTipo === "object") {
    const porTipo = {};
    let mudou = false;
    for (const d of defs) {
      const v = Number(vagasPorTipo[d.id]);
      if (!Number.isFinite(v) || v < 0) continue;
      if (Math.round(v) !== d.defaultTotal) {
        porTipo[d.medicoTipo || d.id] = Math.round(v);
        mudou = true;
      }
    }
    if (mudou) entry.vagasPorTipo = porTipo;
  }

  return Object.keys(entry).length ? entry : null;
}

const DAY_LABEL_CURTO = {
  segunda: "Seg",
  terca: "Ter",
  quarta: "Qua",
  quinta: "Qui",
  sexta: "Sex",
};

const ROLE_STYLE = {
  agente:   { avBg: "#D1FAE5", avTc: "#065F46", tagBg: "#ECFDF5", tagTc: "#065F46", accent: "#10B981", label: "Agente de saúde" },
  recepcao: { avBg: "#C7D2FE", avTc: "#3730A3", tagBg: "#EEF2FF", tagTc: "#4338CA", accent: "#6366F1", label: "Recepcionista" },
  diretor:  { avBg: "#E9D5FF", avTc: "#6B21A8", tagBg: "#F5F3FF", tagTc: "#7C3AED", accent: "#8B5CF6", label: "Direção" },
};

export default function TabConfig({
  profNames,
  profissionaisMap = {},
  profissionalConfigPorSpec = {},
  specKeysDesativados = [],
  showToast,
  isRecepcao,
}) {
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
  const [dentQuartaVisitaDomiciliarDesde, setDentQuartaVisitaDomiciliarDesde] = useState("");
  const [whatsappDirecaoEncaixe, setWhatsappDirecaoEncaixe] = useState("");
  const [savingRegras, setSavingRegras] = useState(false);
  const [painelSpecKeysForm, setPainelSpecKeysForm] = useState(
    Array(PAINEL_VAGAS_MAX_PROFISSIONAIS).fill("")
  );
  const [savingPainel, setSavingPainel] = useState(false);

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
      setWhatsappDirecaoEncaixe(String(s.whatsappDirecaoEncaixe || "").replace(/\D/g, "").slice(0, 11));
      const painelKeys = normalizePainelVagasSpecKeys(s.painelVagasSpecKeys);
      setPainelSpecKeysForm([
        ...painelKeys,
        ...Array(PAINEL_VAGAS_MAX_PROFISSIONAIS - painelKeys.length).fill(""),
      ]);
    });
    return un;
  }, []);

  async function salvarNomeProfissional(specKey, nome, gradeMapTurnos, extras = {}) {
    const n = nome.trim();
    if (!n) {
      showToast("Informe o nome do profissional.", "danger");
      return;
    }
    const raw = {};
    if (gradeMapTurnos && typeof gradeMapTurnos === "object") {
      for (const [dia, arr] of Object.entries(gradeMapTurnos)) {
        if (Array.isArray(arr) && arr.length) raw[dia] = [...arr];
      }
    }
    const isMedico = specKey === "medico";
    const isEnfermeira = specKey === "enfermeira";
    let normalized;
    let gradeParaSalvar = gradeMapTurnos;
    if (isMedico || isEnfermeira) {
      const sessoes = isMedico
        ? normalizeMedicoSessoesConfig(extras.medicoSessoes || [])
        : normalizeEnfermeiraSessoesConfig(extras.enfermeiraSessoes || []);
      if (!sessoes.length) {
        showToast(
          isMedico
            ? "Adicione pelo menos um atendimento do médico (tipo, dia, turno e vagas)."
            : "Adicione pelo menos um atendimento da enfermeira (PCCU ou enfermagem: dia, turno e vagas).",
          "danger"
        );
        return;
      }
      normalized = isMedico
        ? gradeMapFromMedicoSessoes(sessoes)
        : gradeMapFromEnfermeiraSessoes(sessoes);
      gradeParaSalvar = normalized;
      if (!normalized || !Object.keys(normalized).length) {
        showToast("Cada atendimento precisa de dia e turno válidos.", "danger");
        return;
      }
    } else {
      normalized = normalizeAtendimentoDiasTurnosParaSpec(specKey, raw);
      if (!normalized) {
        showToast(
          "Marque pelo menos um dia da semana (segunda a sexta) e um turno (manhã ou tarde) em que o profissional atende na UBS.",
          "danger"
        );
        return;
      }
    }
    const defGrade = defaultAtendimentoDiasTurnosParaSpec(specKey);
    const igualAoPadraoDoCodigo =
      !isMedico && !isEnfermeira && JSON.stringify(normalized) === JSON.stringify(defGrade);

    const role =
      extras.role?.trim() ||
      SPEC_META[specKey]?.role ||
      profissionalConfigPorSpec[specKey]?.role;
    const existente = resolverDocumentoProfissional(specKey, profissionaisMap);
    const diasAtivos = Object.keys(normalized);
    if (isModoDiasAgendamento(extras.agendaModo)) {
      const dias = normalizeDiasAgendamentoLista(extras.diasAgendamento);
      if (!dias.length) {
        showToast(
          "No modo «Dias específicos da semana», marque pelo menos um dia em que o agendamento fica disponível.",
          "danger"
        );
        return;
      }
    }
    const cfgPatch = montarPatchProfissionalConfig(specKey, {
      agendaModo: extras.agendaModo,
      vagasPorTipo: extras.vagasPorTipo,
      vagasBase: extras.vagasBase,
      role,
      isCustom: isSpecKeyCustom(specKey),
      diasAgendamento: extras.diasAgendamento,
      diasAgendamentoPresencial: extras.diasAgendamentoPresencial,
      medicoSessoes: extras.medicoSessoes,
      enfermeiraSessoes: extras.enfermeiraSessoes,
    });
    try {
      // Writes independentes (docs/campos diferentes) disparados em paralelo — evita que o
      // cartão do profissional demore a aparecer em Vagas/Cronograma por causa de round-trips
      // sequenciais desnecessários.
      const tasks = [
        restaurarSpecKeyNaAgenda(specKey),
        existente?.id
          ? updateProfissional(existente.id, {
              nome: n,
              specKey,
              ...(role ? { role } : {}),
              ...(igualAoPadraoDoCodigo
                ? { atendimentoDiasTurnos: deleteField() }
                : { atendimentoDiasTurnos: normalized }),
            })
          : createProfissional({
              nome: n,
              specKey,
              ...(role ? { role } : {}),
              ...(isSpecKeyCustom(specKey) ? { custom: true } : {}),
              ...(igualAoPadraoDoCodigo ? {} : { atendimentoDiasTurnos: normalized }),
            }),
        patchProfissionalConfigPorSpec(specKey, cfgPatch),
      ];
      if (diasAtivos.length) {
        tasks.push(
          updateSettings({
            atendimentoDiasAtivosPorSpec: { [specKey]: diasAtivos },
          })
        );
      }
      await Promise.all(tasks);
      showToast(`Profissional ${existente?.id ? "atualizado" : "cadastrado"}: ${n}`, "success");
    } catch {
      showToast("Erro ao salvar o profissional.", "danger");
    }
  }

  async function criarNovoProfissional(payload) {
    const n = (payload.nome || "").trim();
    const role = (payload.role || "").trim();
    if (!n) {
      showToast("Informe o nome do profissional.", "danger");
      return;
    }
    if (!role) {
      showToast("Informe a função ou área de atuação.", "danger");
      return;
    }
    const raw = {};
    for (const [dia, arr] of Object.entries(payload.gradeMapTurnos || {})) {
      if (Array.isArray(arr) && arr.length) raw[dia] = [...arr];
    }
    const normalized = normalizeAtendimentoDiasTurnosParaSpec("custom_novo", raw);
    if (!normalized) {
      showToast(
        "Marque pelo menos um dia da semana (segunda a sexta) e um turno (manhã ou tarde).",
        "danger"
      );
      return;
    }
    const vagas = Number(payload.vagasBase);
    if (!Number.isFinite(vagas) || vagas < 0) {
      showToast("Informe a quantidade de vagas (0 ou mais).", "danger");
      return;
    }
    if (isModoDiasAgendamento(payload.agendaModo)) {
      const dias = normalizeDiasAgendamentoLista(payload.diasAgendamento);
      if (!dias.length) {
        showToast(
          "Marque os dias da semana em que o agendamento pode ser feito.",
          "danger"
        );
        return;
      }
    }
    try {
      const { specKey } = await createProfissionalComSpecKeyCustom({
        nome: n,
        role,
        custom: true,
        atendimentoDiasTurnos: normalized,
      });
      const cfgPatch = montarPatchProfissionalConfig(specKey, {
        agendaModo: payload.agendaModo || AGENDA_MODO.DIA_UTIL_ANTERIOR,
        vagasBase: vagas,
        role,
        isCustom: true,
        diasAgendamento: payload.diasAgendamento,
      });
      // Writes independentes em paralelo — reduz o atraso até o profissional aparecer em
      // Vagas e Cronograma (antes eram 2 round-trips sequenciais extras).
      await Promise.all([
        patchProfissionalConfigPorSpec(specKey, cfgPatch),
        updateSettings({
          atendimentoDiasAtivosPorSpec: { [specKey]: Object.keys(normalized) },
        }),
      ]);
      showToast(`${n} adicionado à agenda da unidade.`, "success");
    } catch {
      showToast("Erro ao cadastrar o novo profissional.", "danger");
    }
  }

  async function excluirProfissional(specKey) {
    const d = resolverDocumentoProfissional(specKey, profissionaisMap);
    const meta = getSpecMetaForKey(specKey, { profissionalConfigPorSpec });
    const rotulo = meta?.role || DEFAULT_PROF_NAMES[specKey] || specKey;
    if (
      !window.confirm(
        `Remover ${rotulo} da unidade?\n\nO cartão de agendamento deixa de aparecer para todos. Serão apagados cadastro, suspensões, vagas, cronograma e demais dados ligados a este profissional.`
      )
    ) {
      return;
    }
    try {
      await deleteProfissionalComRelacionados(d?.id, specKey);
      showToast(`${rotulo} removido da agenda e da configuração.`, "info");
    } catch {
      showToast("Erro ao remover o profissional.", "danger");
    }
  }

  async function restaurarProfissionalNaGrade(specKey) {
    try {
      await restaurarSpecKeyNaAgenda(specKey);
      showToast(
        "Profissional disponível de novo na lista. Preencha o nome e salve para voltar à agenda.",
        "success"
      );
    } catch {
      showToast("Erro ao restaurar o profissional.", "danger");
    }
  }

  const specKeysAtivos = filtrarSpecKeysAtivos(Object.keys(DEFAULT_PROF_NAMES), specKeysDesativados);
  const specKeysRemovidos = Object.keys(DEFAULT_PROF_NAMES).filter((k) =>
    specKeyEstaDesativado(k, specKeysDesativados)
  );
  const specKeysCustomAtivos = listaSpecKeysCustom(profissionaisMap, profissionalConfigPorSpec).filter(
    (k) => !specKeyEstaDesativado(k, specKeysDesativados)
  );

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

  async function salvarPainelVagas() {
    const escolhidos = painelSpecKeysForm.filter(Boolean);
    if (new Set(escolhidos).size !== escolhidos.length) {
      showToast("Escolha profissionais diferentes em cada linha.", "danger");
      return;
    }
    setSavingPainel(true);
    try {
      await updateSettings({
        painelVagasSpecKeys: normalizePainelVagasSpecKeys(painelSpecKeysForm),
      });
      showToast("Painel de vagas salvo.", "success");
    } catch {
      showToast("Erro ao salvar configurações.", "danger");
    } finally {
      setSavingPainel(false);
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
      cred = await createUserWithEmailAndPassword(secondaryAuth, emailLogin, novoUser.senha);
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
        showToast("Erro ao tentar criar o usuário. Tente novamente.", "danger");
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

  const tabs = [
    { key: "profissionais", label: "Profissionais" },
    { key: "calendario", label: "Calendário & Regras" },
    { key: "painel", label: "Painel de vagas" },
    { key: "usuarios", label: "Usuários" },
  ];

  if (!isRecepcao) return null;

  return (
    <div>
      {/* ── Header ── */}
      <div style={S.pageHeader}>
        <div style={S.pageHeaderRow}>
          <div style={S.pageHeaderIcon}>⚙</div>
          <div>
            <h2 style={S.pageHeaderTitle}>Configuração da unidade</h2>
            <p style={S.pageHeaderSub}>Área exclusiva da recepção</p>
          </div>
        </div>
      </div>

      {/* ── Sub-tabs ── */}
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

      {/* ════════════════ PROFISSIONAIS ════════════════ */}
      {section === "profissionais" && (
        <div>
          <div style={S.infoBanner}>
            <div style={S.infoBannerBody}>
              <p style={S.infoBannerText}>
                Cada card abaixo representa um profissional da agenda. Edite o nome, os dias e turnos
                de atendimento. No <strong>médico</strong> e na <strong>enfermeira</strong>, cadastre
                cada tipo de atendimento separadamente. <strong>Excluir</strong> remove da agenda e
                apaga todos os dados vinculados. Use{" "}
                <button type="button" style={S.linkTab} onClick={() => setSection("usuarios")}>
                  Usuários
                </button>{" "}
                para gerenciar contas de login.
              </p>
            </div>
          </div>

          {specKeysAtivos.length === 0 ? (
            <div style={S.emptyState}>
              <p style={S.emptyStateTitle}>Nenhum profissional ativo</p>
              <p style={S.emptyStateSub}>
                Restaure um perfil na seção abaixo para voltar a exibir na agenda.
              </p>
            </div>
          ) : (
            <div style={S.profList}>
              {specKeysAtivos.map((key) => (
                <ProfRow
                  key={key}
                  specKey={key}
                  nome={profNames[key] || DEFAULT_PROF_NAMES[key]}
                  doc={resolverDocumentoProfissional(key, profissionaisMap)}
                  profCfg={profissionalConfigPorSpec[key]}
                  isMedico={key === "medico"}
                  isEnfermeira={key === "enfermeira"}
                  pccuTotal={pccuTotal}
                  showToast={showToast}
                  onSave={(sk, nomeVal, grade, extras) => salvarNomeProfissional(sk, nomeVal, grade, extras)}
                  onDelete={excluirProfissional}
                />
              ))}
            </div>
          )}

          {specKeysCustomAtivos.length > 0 && (
            <>
              <div style={S.subSectionHead}>
                <span style={S.subSectionBadge}>+</span>
                <p style={S.subSectionTitle}>Adicionados na unidade</p>
              </div>
              <div style={S.profList}>
                {specKeysCustomAtivos.map((key) => (
                  <ProfRow
                    key={key}
                    specKey={key}
                    nome={profNames[key] || "Profissional"}
                    doc={resolverDocumentoProfissional(key, profissionaisMap)}
                    profCfg={profissionalConfigPorSpec[key]}
                    isCustom
                    showToast={showToast}
                    onSave={(sk, nomeVal, grade, extras) => salvarNomeProfissional(sk, nomeVal, grade, extras)}
                    onDelete={excluirProfissional}
                  />
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop: 16 }}>
            <NovoProfissionalForm onCreate={criarNovoProfissional} />
          </div>

          {specKeysRemovidos.length > 0 && (
            <div style={S.removidosBox}>
              <p style={S.removidosTitle}>Removidos da agenda</p>
              <p style={S.removidosHint}>
                Estes perfis não aparecem nas vagas nem para os agentes. Restaure e salve o nome para reativar.
              </p>
              {specKeysRemovidos.map((key) => {
                const meta = SPEC_META[key] || {};
                return (
                  <div key={key} style={S.profRemovidoRow}>
                    <div style={S.profRemovidoInfo}>
                      <span style={S.profRemovidoRole}>{meta.role || key}</span>
                      <span style={S.profRemovidoNome}>{DEFAULT_PROF_NAMES[key] || key}</span>
                    </div>
                    <button
                      type="button"
                      style={S.btnRestore}
                      onClick={() => restaurarProfissionalNaGrade(key)}
                    >
                      Restaurar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════ CALENDÁRIO & REGRAS ════════════════ */}
      {section === "calendario" && (
        <div style={S.calContent}>
          <div style={S.infoBanner}>
            <div style={S.infoBannerBody}>
              <p style={S.infoBannerText}>
                Feriados e pontos facultativos bloqueiam o agendamento na data. O sistema usa o
                último dia útil anterior ao atendimento para abrir a agenda.
              </p>
            </div>
          </div>

          {/* Feriados */}
          <div style={S.calCard}>
            <div style={S.calCardHead}>
              <span style={S.calCardBadge}>📅</span>
              <p style={S.calCardTitle}>Feriados</p>
            </div>
            <div style={S.calCardBody}>
              <div style={S.dateInputRow}>
                <input
                  type="date"
                  style={{ ...S.input, flex: 1, minWidth: 140, maxWidth: 220 }}
                  value={novoFeriado}
                  onChange={(e) => setNovoFeriado(e.target.value)}
                />
                <button type="button" style={S.btnAdd} onClick={adicionarFeriado}>
                  Adicionar
                </button>
              </div>
              {feriados.length > 0 ? (
                <div style={S.feriadoChips}>
                  {feriados.map((iso) => (
                    <span key={iso} style={S.feriadoChip}>
                      {new Date(iso + "T12:00:00").toLocaleDateString("pt-BR")}
                      <button
                        type="button"
                        style={S.feriadoChipX}
                        onClick={() => removerFeriado(iso)}
                        title="Remover"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p style={S.feriadoEmpty}>Nenhum feriado cadastrado.</p>
              )}
            </div>
          </div>

          {/* Pontos Facultativos */}
          <div style={S.calCard}>
            <div style={S.calCardHead}>
              <span style={S.calCardBadge}>📋</span>
              <p style={S.calCardTitle}>Pontos facultativos</p>
            </div>
            <div style={S.calCardBody}>
              <p style={S.calCardHint}>
                Mesma regra dos feriados: sem agendamento na data.
              </p>
              <div style={S.dateInputRow}>
                <input
                  type="date"
                  style={{ ...S.input, flex: 1, minWidth: 140, maxWidth: 220 }}
                  value={novoPontoFacultativo}
                  onChange={(e) => setNovoPontoFacultativo(e.target.value)}
                />
                <button type="button" style={S.btnAdd} onClick={adicionarPontoFacultativo}>
                  Adicionar
                </button>
              </div>
              {pontosFacultativos.length > 0 ? (
                <div style={S.feriadoChips}>
                  {pontosFacultativos.map((iso) => (
                    <span key={iso} style={S.feriadoChip}>
                      {new Date(iso + "T12:00:00").toLocaleDateString("pt-BR")}
                      <button
                        type="button"
                        style={S.feriadoChipX}
                        onClick={() => removerPontoFacultativo(iso)}
                        title="Remover"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p style={S.feriadoEmpty}>Nenhum ponto facultativo cadastrado.</p>
              )}
            </div>
          </div>

          {/* Visitas domiciliares */}
          <div style={S.calCard}>
            <div style={S.calCardHead}>
              <span style={S.calCardBadge}>🏠</span>
              <p style={S.calCardTitle}>Odontologia — visitas domiciliares (quartas)</p>
            </div>
            <div style={S.calCardBody}>
              <p style={S.calCardHint}>
                Escolha uma <strong>quarta-feira</strong> de início. A partir dela, a cada{" "}
                <strong>15 dias</strong> a manhã fica reservada para visitas domiciliares (sem vagas
                na unidade). No dia anterior à cada quarta de visita, agentes e direção veem o
                lembrete na aba <strong>Avisos</strong>.
              </p>
              <div style={S.dateInputRow}>
                <label style={{ ...S.label, flexShrink: 0 }}>Primeira quarta (início)</label>
                <input
                  type="date"
                  style={{ ...S.input, flex: 1, minWidth: 140, maxWidth: 220 }}
                  value={dentQuartaVisitaDomiciliarDesde}
                  onChange={(e) => setDentQuartaVisitaDomiciliarDesde(e.target.value)}
                />
                {dentQuartaVisitaDomiciliarDesde && (
                  <button
                    type="button"
                    style={S.btnDel}
                    onClick={() => setDentQuartaVisitaDomiciliarDesde("")}
                  >
                    Desativar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Vagas PCCU */}
          <div style={S.calCard}>
            <div style={S.calCardHead}>
              <span style={S.calCardBadge}>💉</span>
              <p style={S.calCardTitle}>Vagas PCCU (padrão legado)</p>
            </div>
            <div style={S.calCardBody}>
              <p style={S.calCardHint}>
                Usado só enquanto a enfermeira não tiver agenda customizada salva. Prefira definir
                cada linha de <strong>PCCU</strong> no card da enfermeira.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                <label style={S.label}>Total de vagas</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  style={{ ...S.input, maxWidth: 100 }}
                  value={pccuTotal}
                  onChange={(e) => setPccuTotal(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            style={{ ...S.btnSalvar, opacity: savingRegras ? 0.6 : 1 }}
            disabled={savingRegras}
            onClick={salvarRegras}
          >
            {savingRegras ? "Salvando…" : "Salvar calendário e regras"}
          </button>
        </div>
      )}

      {/* ════════════════ PAINEL DE VAGAS (kiosk do balcão) ════════════════ */}
      {section === "painel" && (
        <div style={S.calContent}>
          <div style={S.infoBanner}>
            <div style={S.infoBannerBody}>
              <p style={S.infoBannerText}>
                Escolha até {PAINEL_VAGAS_MAX_PROFISSIONAIS} profissionais que vão alternar no
                painel de vagas exibido no tablet/celular do balcão. Depois, use o botão "Ativar
                painel" na aba Vagas para ligar a exibição.
              </p>
            </div>
          </div>

          <div style={S.calCard}>
            <div style={S.calCardHead}>
              <span style={S.calCardBadge}>🖥️</span>
              <p style={S.calCardTitle}>Profissionais exibidos</p>
            </div>
            <div style={S.calCardBody}>
              {painelSpecKeysForm.map((value, i) => (
                <div
                  key={i}
                  style={{ display: "flex", alignItems: "center", gap: 10, marginTop: i ? 10 : 0 }}
                >
                  <label style={S.label}>{i + 1}º profissional</label>
                  <select
                    style={S.input}
                    value={value}
                    onChange={(e) =>
                      setPainelSpecKeysForm((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                  >
                    <option value="">— selecione —</option>
                    {[...specKeysAtivos, ...specKeysCustomAtivos].map((key) => (
                      <option key={key} value={key}>
                        {profNames[key] || DEFAULT_PROF_NAMES[key] || key}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <p style={S.calCardHint}>
                <a href="/painel-vagas" target="_blank" rel="noreferrer">
                  Abrir o painel numa nova aba
                </a>{" "}
                para testar antes de configurar o tablet.
              </p>
            </div>
          </div>

          <button
            type="button"
            style={{ ...S.btnSalvar, opacity: savingPainel ? 0.6 : 1 }}
            disabled={savingPainel}
            onClick={salvarPainelVagas}
          >
            {savingPainel ? "Salvando…" : "Salvar painel de vagas"}
          </button>
        </div>
      )}

      {/* ════════════════ USUÁRIOS ════════════════ */}
      {section === "usuarios" && (
        <div>
          <div style={S.infoBanner}>
            <div style={S.infoBannerBody}>
              <p style={S.infoBannerText}>
                Crie ou exclua contas de acesso. O <strong>e-mail</strong> é usado como login. Para
                redefinir senha, use o botão <strong>Redefinir senha</strong> na tela de login.
              </p>
            </div>
          </div>

          {/* WhatsApp da direção */}
          <div style={S.calCard}>
            <div style={S.calCardHead}>
              <span style={S.calCardBadge}>📱</span>
              <p style={S.calCardTitle}>WhatsApp da direção (encaixes)</p>
            </div>
            <div style={S.calCardBody}>
              <p style={S.calCardHint}>
                Quando um agente solicita encaixe, o pedido vai para este número. Quando a direção
                solicita, o pedido vai para o WhatsApp do recepcionista (configurado abaixo no card
                do usuário recepcionista).
              </p>
              <WaDirecaoEncaixeSettingRow digits={whatsappDirecaoEncaixe} showToast={showToast} />
            </div>
          </div>

          {/* Novo usuário */}
          <div style={S.calCard}>
            <div style={{ ...S.calCardHead, background: "linear-gradient(90deg, #EEF2FF 0%, #F8FAFC 100%)", borderBottom: "1px solid #C7D2FE" }}>
              <span style={S.calCardBadge}>+</span>
              <p style={S.calCardTitle}>Novo usuário</p>
            </div>
            <div style={S.calCardBody}>
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
                <Field label="Perfil de acesso">
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
              <button
                style={{ ...S.btnSalvar, opacity: loading ? 0.6 : 1 }}
                disabled={loading}
                onClick={criarUsuario}
              >
                {loading ? "Criando…" : "Criar usuário"}
              </button>
            </div>
          </div>

          {/* Lista de usuários */}
          <div style={S.subSectionHead}>
            <span style={S.subSectionBadge}>👥</span>
            <p style={S.subSectionTitle}>Usuários cadastrados</p>
          </div>

          {users.length === 0 ? (
            <div style={S.emptyState}>
              <p style={S.emptyStateTitle}>Nenhum usuário cadastrado</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {users.map((u) => {
                const ruleKey = u.rule || u.role || "agente";
                const rs = ROLE_STYLE[ruleKey] || ROLE_STYLE.agente;
                return (
                  <div key={u.id}>
                    <div style={{ ...S.userCard, borderLeftColor: rs.accent }}>
                      <div style={{ ...S.userAvatar, background: rs.avBg, color: rs.avTc }}>
                        {u.nome?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div style={S.userInfo}>
                        <div style={S.userTopRow}>
                          <p style={S.userName}>{u.nome}</p>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 999,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              background: rs.tagBg,
                              color: rs.tagTc,
                            }}
                          >
                            {rs.label}
                          </span>
                        </div>
                        <p style={S.userDetail}>
                          {u.cpf
                            ? `CPF: ${u.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}`
                            : null}
                          {u.email ? ` · ${u.email}` : null}
                          {u.telefone ? ` · ${formatTelefoneBR(u.telefone)}` : null}
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
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// WaDirecaoEncaixeSettingRow
// ─────────────────────────────────────────────
function WaDirecaoEncaixeSettingRow({ digits, showToast }) {
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = String(digits || "").replace(/\D/g, "").slice(0, 11);
    if (!d) { setVal(""); return; }
    const f = d.length <= 10
      ? d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3")
      : d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
    setVal(f);
  }, [digits]);

  function handleChange(v) {
    const d = v.replace(/\D/g, "").slice(0, 11);
    const f = d.length <= 10
      ? d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3")
      : d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
    setVal(f);
  }

  async function salvar() {
    const d = val.replace(/\D/g, "");
    if (d.length < 10) {
      showToast("Informe um WhatsApp válido (DDD + número).", "danger");
      return;
    }
    setSaving(true);
    try {
      await updateSettings({ whatsappDirecaoEncaixe: d });
      showToast("WhatsApp da direção (encaixes) salvo.", "success");
    } catch {
      showToast("Erro ao salvar WhatsApp da direção.", "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={S.waInputRow}>
      <label style={S.label}>Número que recebe pedidos de encaixe dos agentes</label>
      <div style={S.waInputs}>
        <input
          style={{ ...S.input, flex: 1, minWidth: 160 }}
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

function isEmailLoginValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─────────────────────────────────────────────
// RecepcionistaWhatsappRow
// ─────────────────────────────────────────────
function RecepcionistaWhatsappRow({ usuario, showToast, onSaved }) {
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = String(usuario.telefoneWhatsapp || "").replace(/\D/g, "").slice(0, 11);
    if (!d) { setVal(""); return; }
    const f = d.length <= 10
      ? d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3")
      : d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
    setVal(f);
  }, [usuario.id, usuario.telefoneWhatsapp]);

  function handleChange(v) {
    const d = v.replace(/\D/g, "").slice(0, 11);
    const f = d.length <= 10
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
      showToast(
        "WhatsApp da recepção salvo. Agendamentos e encaixes solicitados pela direção usam este número.",
        "success"
      );
    } catch {
      showToast("Erro ao salvar WhatsApp.", "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={S.waSubRow}>
      <div style={S.waSubRowContent}>
        <span style={S.waSubLabel}>WhatsApp da recepção (agendamentos e encaixes da direção)</span>
        <div style={S.waInputs}>
          <input
            style={{ ...S.input, flex: 1, minWidth: 160 }}
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
    </div>
  );
}

// ─────────────────────────────────────────────
// gradeMapInicialProf (helper — lógica inalterada)
// ─────────────────────────────────────────────
function gradeMapInicialProf(specKey, doc) {
  const def = defaultAtendimentoDiasTurnosParaSpec(specKey);
  const norm = normalizeAtendimentoDiasTurnosParaSpec(specKey, doc?.atendimentoDiasTurnos);
  const out = {};
  for (const dia of ORDEM_DIA_SEMANA_GRADE) {
    if (norm && Array.isArray(norm[dia]) && norm[dia].length) {
      out[dia] = [...norm[dia]];
    } else if (norm) {
      out[dia] = [];
    } else {
      out[dia] = def[dia] ? [...def[dia]] : [];
    }
  }
  return out;
}

// ─────────────────────────────────────────────
// NovoProfissionalForm
// ─────────────────────────────────────────────
function NovoProfissionalForm({ onCreate }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [role, setRole] = useState("");
  const [roleOutro, setRoleOutro] = useState("");
  const [vagasBase, setVagasBase] = useState(8);
  const [agendaModo, setAgendaModo] = useState(AGENDA_MODO.DIA_UTIL_ANTERIOR);
  const [diasAgendamento, setDiasAgendamento] = useState([]);
  const [gradeMap, setGradeMap] = useState(() => {
    const out = {};
    for (const dia of ORDEM_DIA_SEMANA_GRADE) out[dia] = [];
    return out;
  });
  const [saving, setSaving] = useState(false);

  function toggleTurno(dia, turno) {
    setGradeMap((prev) => {
      const cur = new Set(prev[dia] || []);
      if (cur.has(turno)) cur.delete(turno);
      else cur.add(turno);
      return { ...prev, [dia]: [...cur].sort() };
    });
  }

  function toggleDiaAgendamento(dia) {
    setDiasAgendamento((prev) => {
      const s = new Set(prev);
      if (s.has(dia)) s.delete(dia);
      else s.add(dia);
      return normalizeDiasAgendamentoLista([...s]);
    });
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const roleFinal = role === "Outro" ? roleOutro.trim() : role;
      await onCreate({
        nome,
        role: roleFinal,
        gradeMapTurnos: gradeMap,
        vagasBase,
        agendaModo,
        diasAgendamento,
      });
      setNome("");
      setRole("");
      setRoleOutro("");
      setVagasBase(8);
      setAgendaModo(AGENDA_MODO.DIA_UTIL_ANTERIOR);
      setDiasAgendamento([]);
      setGradeMap(() => {
        const out = {};
        for (const dia of ORDEM_DIA_SEMANA_GRADE) out[dia] = [];
        return out;
      });
      setAberto(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={S.subSectionHead}>
        <span style={S.subSectionBadge}>+</span>
        <p style={S.subSectionTitle}>Novo profissional</p>
      </div>
      <p style={S.hintMuted}>
        Use quando alguém for contratado e precisar aparecer na agenda além dos perfis fixos.
      </p>
      {!aberto ? (
        <button type="button" style={S.btnAdd} onClick={() => setAberto(true)}>
          + Adicionar profissional
        </button>
      ) : (
        <div style={S.novoProfPanel}>
          <div style={S.formGrid}>
            <Field label="Nome do profissional">
              <input
                style={S.input}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Dra. Maria Silva"
              />
            </Field>
            <Field label="Função ou área">
              <select style={S.input} value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">Selecione…</option>
                {ROLES_SUGERIDAS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              {role === "Outro" && (
                <input
                  style={{ ...S.input, marginTop: 6 }}
                  value={roleOutro}
                  onChange={(e) => setRoleOutro(e.target.value)}
                  placeholder="Descreva a função"
                />
              )}
            </Field>
            <Field label="Vagas por turno">
              <input
                type="number"
                min={0}
                max={99}
                style={{ ...S.input, maxWidth: 100 }}
                value={vagasBase}
                onChange={(e) => setVagasBase(Number(e.target.value))}
              />
            </Field>
            <Field label="Regra de agendamento">
              <select style={S.input} value={agendaModo} onChange={(e) => setAgendaModo(e.target.value)}>
                {AGENDA_MODO_OPCOES.filter((o) => o.value !== AGENDA_MODO.PADRAO).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          </div>

          {isModoDiasAgendamento(agendaModo) && (
            <Field label="Dias em que o agendamento fica disponível">
              <DiasAgendamentoSelector
                dias={diasAgendamento}
                onToggle={toggleDiaAgendamento}
                hint="Ex.: nutricionista atende sexta — marque terça, quarta e quinta para liberar agendamento antes."
              />
            </Field>
          )}

          <div>
            <p style={S.profSectionTitle}>Dias e turnos na UBS</p>
            <GradeDiasTurnos gradeMap={gradeMap} onToggle={toggleTurno} />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <button
              type="button"
              style={{ ...S.btnSalvar, opacity: saving ? 0.6 : 1 }}
              disabled={saving}
              onClick={handleCreate}
            >
              {saving ? "Cadastrando…" : "Cadastrar profissional"}
            </button>
            <button type="button" style={S.btnCancelar} onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// DiasAgendamentoSelector — toggle pills
// ─────────────────────────────────────────────
function DiasAgendamentoSelector({ dias, onToggle, hint }) {
  const ativos = dias || [];
  return (
    <div style={{ marginTop: 4 }}>
      {hint && <p style={S.gradeHint}>{hint}</p>}
      <div style={S.diaChips}>
        {ORDEM_DIA_SEMANA_GRADE.map((dia) => {
          const ativo = ativos.includes(dia);
          return (
            <button
              key={dia}
              type="button"
              style={{ ...S.diaChip, ...(ativo ? S.diaChipAtivo : {}) }}
              onClick={() => onToggle(dia)}
            >
              {DAY_LABEL_CURTO[dia] || dia}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function novoIdSessaoProf(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─────────────────────────────────────────────
// ProfissionalSessoesEditor
// ─────────────────────────────────────────────
function ProfissionalSessoesEditor({
  sessoes,
  onChange,
  showToast,
  tiposMap,
  tipoField,
  normalizeFn,
  idPrefix,
  hint,
  defaultNovo,
}) {
  const [novo, setNovo] = useState(defaultNovo);

  function atualizar(lista) {
    onChange(normalizeFn(lista));
  }

  function remover(id) {
    atualizar(sessoes.filter((s) => s.id !== id));
  }

  function adicionar() {
    const vagas = Number(novo.vagas);
    if (!Number.isFinite(vagas) || vagas < 0) return;
    const linha = {
      id: novoIdSessaoProf(idPrefix),
      [tipoField]: novo[tipoField],
      dia: novo.dia,
      turno: novo.turno,
      vagas: Math.round(vagas),
    };
    const uk = `${linha[tipoField]}|${linha.dia}|${linha.turno}`;
    if (sessoes.some((s) => `${s[tipoField]}|${s.dia}|${s.turno}` === uk)) {
      showToast?.("Já existe atendimento com este tipo, dia e turno.", "info");
      return;
    }
    atualizar([...sessoes, linha]);
  }

  return (
    <div style={S.sessoesWrap}>
      {hint && <p style={S.gradeHint}>{hint}</p>}
      {sessoes.length > 0 && (
        <ul style={S.sessoesList}>
          {sessoes.map((s) => (
            <li key={s.id} style={S.sessaoItem}>
              <div style={S.sessaoItemInfo}>
                <span style={S.sessaoTipo}>{tiposMap[s[tipoField]]?.label || s[tipoField]}</span>
                <span style={S.sessaoMeta}>
                  {DAY_LABEL[s.dia] || s.dia}
                  {" · "}
                  {s.turno === "manha" ? "Manhã" : "Tarde"}
                  {" · "}
                  <strong>{s.vagas}</strong> vaga{s.vagas !== 1 ? "s" : ""}
                </span>
              </div>
              <button type="button" style={S.btnDelSm} onClick={() => remover(s.id)}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={S.sessaoForm}>
        <select
          style={S.input}
          value={novo[tipoField]}
          onChange={(e) => setNovo((n) => ({ ...n, [tipoField]: e.target.value }))}
        >
          {Object.entries(tiposMap).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </select>
        <select
          style={S.input}
          value={novo.dia}
          onChange={(e) => setNovo((n) => ({ ...n, dia: e.target.value }))}
        >
          {ORDEM_DIA_SEMANA_GRADE.map((d) => (
            <option key={d} value={d}>{DAY_LABEL[d]}</option>
          ))}
        </select>
        <select
          style={S.input}
          value={novo.turno}
          onChange={(e) => setNovo((n) => ({ ...n, turno: e.target.value }))}
        >
          <option value="manha">Manhã</option>
          <option value="tarde">Tarde</option>
        </select>
        <input
          type="number"
          min={0}
          max={99}
          style={S.inputNum}
          value={novo.vagas}
          onChange={(e) => setNovo((n) => ({ ...n, vagas: Number(e.target.value) }))}
          title="Quantidade de vagas"
        />
        <button type="button" style={S.btnAdd} onClick={adicionar}>
          Adicionar
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// GradeDiasTurnos — toggle pills
// ─────────────────────────────────────────────
function GradeDiasTurnos({ gradeMap, onToggle }) {
  return (
    <div style={S.gradeBox}>
      {ORDEM_DIA_SEMANA_GRADE.map((dia) => {
        const ativos = gradeMap[dia] || [];
        const temManha = ativos.includes("manha");
        const temTarde = ativos.includes("tarde");
        return (
          <div key={dia} style={S.gradeRow}>
            <span style={S.gradeDia}>{DAY_LABEL_CURTO[dia] || dia}</span>
            <div style={S.gradeTurnos}>
              <button
                type="button"
                style={{ ...S.turnoBtn, ...(temManha ? S.turnoBtnManha : {}) }}
                onClick={() => onToggle(dia, "manha")}
              >
                Manhã
              </button>
              <button
                type="button"
                style={{ ...S.turnoBtn, ...(temTarde ? S.turnoBtnTarde : {}) }}
                onClick={() => onToggle(dia, "tarde")}
              >
                Tarde
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// ProfRow — card-based redesign
// ─────────────────────────────────────────────
function ProfRow({
  specKey,
  nome,
  doc,
  profCfg,
  isCustom = false,
  isMedico = false,
  isEnfermeira = false,
  pccuTotal = DEFAULT_PCCU_TOTAL,
  onSave,
  onDelete,
  showToast,
}) {
  const [val, setVal] = useState(nome);
  const [gradeMap, setGradeMap] = useState(() => gradeMapInicialProf(specKey, doc));
  const [medicoSessoes, setMedicoSessoes] = useState(() =>
    isMedico ? medicoSessoesEfetivas(profCfg) : []
  );
  const [enfermeiraSessoes, setEnfermeiraSessoes] = useState(() =>
    isEnfermeira ? enfermeiraSessoesEfetivas(profCfg, pccuTotal) : []
  );
  const sessionDefs = useMemo(
    () => (isCustom || isMedico || isEnfermeira ? [] : getSessionDefsForSpecKey(specKey)),
    [specKey, isCustom, isMedico, isEnfermeira]
  );
  const [vagasPorTipo, setVagasPorTipo] = useState(() => {
    const out = {};
    for (const d of sessionDefs) {
      const saved = profCfg?.vagasPorTipo?.[d.medicoTipo || d.id];
      out[d.id] = saved != null ? saved : d.defaultTotal;
    }
    return out;
  });
  const [vagasBase, setVagasBase] = useState(() => {
    const v = profCfg?.vagasBase;
    return v != null ? v : 8;
  });
  const [agendaModo, setAgendaModo] = useState(() =>
    normalizarAgendaModo(profCfg?.agendaModo || defaultAgendaModoParaSpec(specKey))
  );
  const [diasAgendamento, setDiasAgendamento] = useState(() =>
    normalizeDiasAgendamentoLista(
      profCfg?.diasAgendamento?.length
        ? profCfg.diasAgendamento
        : defaultDiasAgendamentoParaSpec(specKey)
    )
  );
  const [diasAgendamentoPresencial, setDiasAgendamentoPresencial] = useState(() =>
    normalizeDiasAgendamentoLista(
      profCfg?.diasAgendamentoPresencial?.length
        ? profCfg.diasAgendamentoPresencial
        : defaultDiasAgendamentoPresencialParaSpec(specKey) || []
    )
  );

  const meta = getSpecMetaForKey(specKey, {
    profissionalConfigPorSpec: { [specKey]: profCfg },
    roleFallback: doc?.role,
    nome: val,
  });
  const snapDocGrade = doc?.id
    ? JSON.stringify(doc?.atendimentoDiasTurnos || {})
    : `new-${specKey}`;

  useEffect(() => setVal(nome), [nome]);
  useEffect(() => {
    setGradeMap(gradeMapInicialProf(specKey, doc));
  }, [specKey, doc?.id, snapDocGrade]);

  useEffect(() => {
    setAgendaModo(normalizarAgendaModo(profCfg?.agendaModo || defaultAgendaModoParaSpec(specKey)));
    setDiasAgendamento(
      normalizeDiasAgendamentoLista(
        profCfg?.diasAgendamento?.length
          ? profCfg.diasAgendamento
          : defaultDiasAgendamentoParaSpec(specKey)
      )
    );
    setDiasAgendamentoPresencial(
      normalizeDiasAgendamentoLista(
        profCfg?.diasAgendamentoPresencial?.length
          ? profCfg.diasAgendamentoPresencial
          : defaultDiasAgendamentoPresencialParaSpec(specKey) || []
      )
    );
    if (isMedico) {
      setMedicoSessoes(medicoSessoesEfetivas(profCfg));
    } else if (isEnfermeira) {
      setEnfermeiraSessoes(enfermeiraSessoesEfetivas(profCfg, pccuTotal));
    } else if (isCustom) {
      setVagasBase(profCfg?.vagasBase != null ? profCfg.vagasBase : 8);
    } else {
      const out = {};
      for (const d of sessionDefs) {
        const saved = profCfg?.vagasPorTipo?.[d.medicoTipo || d.id];
        out[d.id] = saved != null ? saved : d.defaultTotal;
      }
      setVagasPorTipo(out);
    }
  }, [specKey, profCfg, isCustom, isMedico, isEnfermeira, pccuTotal, sessionDefs]);

  const temCadastro = Boolean(doc?.id);

  function toggleTurno(dia, turno) {
    setGradeMap((prev) => {
      const cur = new Set(prev[dia] || []);
      if (cur.has(turno)) cur.delete(turno);
      else cur.add(turno);
      return { ...prev, [dia]: [...cur].sort() };
    });
  }

  function toggleDiaAgendamento(dia) {
    setDiasAgendamento((prev) => {
      const s = new Set(prev);
      if (s.has(dia)) s.delete(dia);
      else s.add(dia);
      return normalizeDiasAgendamentoLista([...s]);
    });
  }

  function toggleDiaAgendamentoPresencial(dia) {
    setDiasAgendamentoPresencial((prev) => {
      const s = new Set(prev);
      if (s.has(dia)) s.delete(dia);
      else s.add(dia);
      return normalizeDiasAgendamentoLista([...s]);
    });
  }

  function handleSave() {
    onSave(
      specKey,
      val,
      isMedico
        ? gradeMapFromMedicoSessoes(medicoSessoes)
        : isEnfermeira
          ? gradeMapFromEnfermeiraSessoes(enfermeiraSessoes)
          : gradeMap,
      {
        agendaModo,
        vagasPorTipo,
        vagasBase,
        diasAgendamento,
        diasAgendamentoPresencial,
        medicoSessoes: isMedico ? medicoSessoes : undefined,
        enfermeiraSessoes: isEnfermeira ? enfermeiraSessoes : undefined,
        role: isCustom ? doc?.role || meta.role : undefined,
      }
    );
  }

  return (
    <div style={{ ...S.profCard, borderLeftColor: meta.tc || "#A5B4FC" }}>
      {/* ── Card header ── */}
      <div style={S.profCardHead}>
        <div style={{ ...S.avSmall, background: meta.bg || "#EEF2FF", color: meta.tc || "#4338CA" }}>
          {meta.av || "?"}
        </div>
        <div style={S.profCardHeadText}>
          <span style={S.profRole}>{meta.role || specKey}</span>
          <input
            style={S.profNameInput}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Nome do profissional"
          />
          {!temCadastro && (
            <span style={S.profHintMuted}>Novo — preencha e salve para cadastrar.</span>
          )}
        </div>
        <div style={S.profCardHeadActions}>
          <button type="button" style={S.btnSave} onClick={handleSave}>
            {temCadastro ? "Salvar" : "Cadastrar"}
          </button>
          <button
            type="button"
            style={{ ...S.btnDel, opacity: temCadastro ? 1 : 0.4 }}
            disabled={!temCadastro}
            title={temCadastro ? "Excluir cadastro" : "Nada para excluir"}
            onClick={() => onDelete(specKey)}
          >
            Excluir
          </button>
        </div>
      </div>

      {/* ── Card body ── */}
      <div style={S.profCardBody}>
        {/* Agenda / sessões */}
        <div>
          {isMedico ? (
            <>
              <p style={S.profSectionTitle}>Atendimentos na agenda</p>
              <ProfissionalSessoesEditor
                sessoes={medicoSessoes}
                onChange={setMedicoSessoes}
                showToast={showToast}
                tiposMap={MEDICO_TIPO}
                tipoField="medicoTipo"
                normalizeFn={normalizeMedicoSessoesConfig}
                idPrefix="ms"
                hint="Cadastre tipo, dia, turno e vagas. Ex.: gestantes, terça à tarde, 6 vagas."
                defaultNovo={{ medicoTipo: "clinico", dia: "segunda", turno: "tarde", vagas: 8 }}
              />
            </>
          ) : isEnfermeira ? (
            <>
              <p style={S.profSectionTitle}>Atendimentos na agenda (PCCU e enfermagem)</p>
              <ProfissionalSessoesEditor
                sessoes={enfermeiraSessoes}
                onChange={setEnfermeiraSessoes}
                showToast={showToast}
                tiposMap={ENFERMEIRA_ATENDIMENTO_TIPO}
                tipoField="enfermeiraTipo"
                normalizeFn={normalizeEnfermeiraSessoesConfig}
                idPrefix="es"
                hint="Informe PCCU ou enfermagem, dia, turno e vagas. Ex.: PCCU, quarta à tarde, 15 vagas."
                defaultNovo={{ enfermeiraTipo: "pccu", dia: "quarta", turno: "tarde", vagas: 15 }}
              />
            </>
          ) : (
            <>
              <p style={S.profSectionTitle}>Dias e turnos na UBS</p>
              {specKey === "dentPatrick" && (
                <p style={S.profHintMuted}>
                  Às <strong>sextas-feiras à tarde</strong> o Dr. Patrick reserva o turno para visitas domiciliares.
                </p>
              )}
              <GradeDiasTurnos gradeMap={gradeMap} onToggle={toggleTurno} />
            </>
          )}
        </div>

        {/* Vagas e agendamento */}
        <div>
          <p style={S.profSectionTitle}>
            {isMedico || isEnfermeira ? "Regra de agendamento" : "Vagas e agendamento"}
          </p>

          {!(isMedico || isEnfermeira) && (
            isCustom ? (
              <div style={{ marginBottom: 8 }}>
                <label style={S.vagasAgendaLbl}>
                  Vagas por turno
                  <input
                    type="number"
                    min={0}
                    max={99}
                    style={S.inputNum}
                    value={vagasBase}
                    onChange={(e) => setVagasBase(Number(e.target.value))}
                  />
                </label>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 8 }}>
                {sessionDefs.map((d) => (
                  <label key={d.id} style={S.vagasAgendaLbl}>
                    {d.label}
                    <input
                      type="number"
                      min={0}
                      max={99}
                      style={S.inputNum}
                      value={vagasPorTipo[d.id] ?? d.defaultTotal}
                      onChange={(e) =>
                        setVagasPorTipo((prev) => ({ ...prev, [d.id]: Number(e.target.value) }))
                      }
                    />
                  </label>
                ))}
              </div>
            )
          )}

          <label style={S.vagasAgendaLblFull}>
            Agendamento para agentes
            <select
              style={S.input}
              value={agendaModo}
              onChange={(e) => setAgendaModo(e.target.value)}
            >
              {AGENDA_MODO_OPCOES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          {isModoDiasAgendamento(agendaModo) && (
            <>
              <p style={{ ...S.profSectionTitle, marginTop: 10 }}>
                Dias de agendamento pelo app
              </p>
              <DiasAgendamentoSelector
                dias={diasAgendamento}
                onToggle={toggleDiaAgendamento}
                hint="Dias em que agentes e direção podem solicitar vaga (das 13h30 às 18h)."
              />
              <p style={{ ...S.profSectionTitle, marginTop: 10 }}>
                Dias de agendamento presencial
              </p>
              <DiasAgendamentoSelector
                dias={diasAgendamentoPresencial}
                onToggle={toggleDiaAgendamentoPresencial}
                hint="Dias em que o paciente pode ir à UBS agendar pessoalmente."
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Field — label + input wrapper
// ─────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={S.fieldWrap}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const S = {
  // Page header
  pageHeader: {
    marginBottom: 18,
    padding: "14px 16px",
    background: "linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)",
    borderRadius: 12,
    border: "1px solid #C7D2FE",
  },
  pageHeaderRow: { display: "flex", alignItems: "center", gap: 12 },
  pageHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    background: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    flexShrink: 0,
  },
  pageHeaderTitle: { fontSize: 16, fontWeight: 700, color: "#1E1B4B", margin: "0 0 2px", letterSpacing: "-0.01em" },
  pageHeaderSub: { fontSize: 11, color: "#6366F1", margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" },

  // Sub-tabs
  tabs: {
    display: "flex", gap: 4, marginBottom: 18,
    background: "#F1F5F9", borderRadius: 10, padding: 4, flexWrap: "wrap",
  },
  stab: {
    flex: 1, padding: "9px 12px", fontSize: 12, fontWeight: 500,
    border: "none", borderRadius: 7, cursor: "pointer",
    background: "transparent", color: "#64748B", minWidth: 0, fontFamily: "inherit",
  },
  stabActive: {
    background: "#fff", color: "#4338CA", fontWeight: 700,
    boxShadow: "0 1px 4px rgba(15,23,42,0.1)",
  },

  // Info banner
  infoBanner: {
    display: "flex", gap: 10, padding: "10px 14px",
    background: "#F8FAFC", borderRadius: 9,
    border: "0.5px solid #E2E8F0", marginBottom: 14,
  },
  infoBannerBody: { flex: 1, minWidth: 0 },
  infoBannerText: { fontSize: 12, color: "#64748B", margin: 0, lineHeight: 1.55 },

  // Link-style tab button
  linkTab: {
    font: "inherit", fontWeight: 600, color: "#4338CA",
    background: "none", border: "none", padding: 0,
    cursor: "pointer", textDecoration: "underline",
  },

  // Sub-section headers
  subSectionHead: {
    display: "flex", alignItems: "center", gap: 7,
    margin: "18px 0 8px",
  },
  subSectionBadge: {
    width: 22, height: 22, borderRadius: 6,
    background: "#E0E7FF", color: "#4338CA",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 12, fontWeight: 700, flexShrink: 0,
  },
  subSectionTitle: {
    fontSize: 12, fontWeight: 700, color: "#334155", margin: 0,
    textTransform: "uppercase", letterSpacing: "0.04em",
  },

  // Empty state
  emptyState: {
    padding: "22px 18px", textAlign: "center",
    background: "#F8FAFC", borderRadius: 10,
    border: "1px dashed #CBD5E1", marginBottom: 12,
  },
  emptyStateTitle: { fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 4px" },
  emptyStateSub: { fontSize: 12, color: "#64748B", margin: 0 },

  // Prof list container
  profList: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 },

  // Prof card
  profCard: {
    background: "#fff",
    border: "0.5px solid #E2E8F0",
    borderLeft: "3px solid #A5B4FC",
    borderRadius: 10,
    boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
    overflow: "hidden",
  },
  profCardHead: {
    display: "flex", alignItems: "flex-start", gap: 10,
    padding: "11px 14px",
    background: "linear-gradient(90deg, #F8FAFC 0%, #fff 100%)",
    borderBottom: "0.5px solid #E2E8F0",
    flexWrap: "wrap",
  },
  profCardHeadText: { flex: 1, minWidth: 120, display: "flex", flexDirection: "column", gap: 4 },
  profCardHeadActions: { display: "flex", gap: 6, alignItems: "center", flexShrink: 0 },
  profCardBody: { padding: "12px 14px", display: "flex", flexDirection: "column", gap: 14 },

  profRole: { fontSize: 10, color: "#64748B", margin: 0, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" },
  profNameInput: {
    padding: "7px 10px", fontSize: 13, fontFamily: "inherit",
    border: "1.5px solid #E2E8F0", borderRadius: 8,
    background: "#fff", color: "#0F172A", outline: "none",
    width: "100%", boxSizing: "border-box",
  },
  profHintMuted: { fontSize: 11, color: "#94A3B8", margin: "2px 0 0", fontStyle: "italic" },
  profSectionTitle: {
    fontSize: 10, fontWeight: 700, color: "#94A3B8",
    margin: "0 0 7px", textTransform: "uppercase", letterSpacing: "0.07em",
  },

  // Grade (days × shifts) — toggle buttons
  gradeBox: {
    display: "flex", flexDirection: "column", gap: 5,
    padding: "10px 12px", background: "#F8FAFC",
    borderRadius: 8, border: "0.5px solid #E2E8F0",
  },
  gradeRow: { display: "flex", alignItems: "center", gap: 10 },
  gradeDia: { minWidth: 32, fontSize: 12, fontWeight: 700, color: "#475569" },
  gradeTurnos: { display: "flex", gap: 6 },
  turnoBtn: {
    fontFamily: "inherit", fontSize: 11, fontWeight: 600,
    color: "#94A3B8", background: "#fff",
    border: "1px solid #E2E8F0", borderRadius: 999,
    padding: "4px 11px", cursor: "pointer",
  },
  turnoBtnManha: {
    color: "#92400E", background: "#FEF3C7", borderColor: "#FDE68A",
  },
  turnoBtnTarde: {
    color: "#1E40AF", background: "#DBEAFE", borderColor: "#BFDBFE",
  },
  gradeHint: { fontSize: 11, color: "#94A3B8", margin: "0 0 7px", lineHeight: 1.45 },

  // Day chips (dias agendamento)
  diaChips: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 },
  diaChip: {
    fontFamily: "inherit", fontSize: 12, fontWeight: 600,
    color: "#64748B", background: "#fff",
    border: "1px solid #E2E8F0", borderRadius: 999,
    padding: "5px 12px", cursor: "pointer",
  },
  diaChipAtivo: {
    color: "#4338CA", background: "#EEF2FF", borderColor: "#A5B4FC",
  },

  // Removed profs
  removidosBox: {
    marginTop: 18, padding: "14px 16px",
    background: "#FFFBEB", border: "0.5px solid #FDE68A",
    borderRadius: 10,
  },
  removidosTitle: {
    fontSize: 10, fontWeight: 700, color: "#92400E",
    margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em",
  },
  removidosHint: { fontSize: 12, color: "#B45309", margin: "0 0 10px", lineHeight: 1.45 },
  profRemovidoRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 10, flexWrap: "wrap",
    padding: "9px 12px", background: "#fff",
    borderRadius: 8, border: "0.5px solid #FDE68A",
    marginBottom: 6,
  },
  profRemovidoInfo: { display: "flex", flexDirection: "column", gap: 2 },
  profRemovidoRole: { fontSize: 12, fontWeight: 700, color: "#92400E" },
  profRemovidoNome: { fontSize: 11, color: "#B45309" },

  // NovoProfissional panel
  novoProfPanel: {
    padding: "14px 16px", background: "#F8FAFC",
    borderRadius: 10, border: "0.5px solid #E2E8F0",
    display: "flex", flexDirection: "column", gap: 12,
  },

  // Calendar section cards
  calContent: { display: "flex", flexDirection: "column", gap: 0 },
  calCard: {
    background: "#fff", border: "0.5px solid #E2E8F0",
    borderRadius: 10, boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    marginBottom: 10, overflow: "hidden",
  },
  calCardHead: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "9px 14px",
    background: "linear-gradient(90deg, #F8FAFC 0%, #fff 100%)",
    borderBottom: "0.5px solid #E2E8F0",
  },
  calCardBadge: { fontSize: 15, flexShrink: 0 },
  calCardTitle: { fontSize: 13, fontWeight: 700, color: "#0F172A", margin: 0 },
  calCardHint: { fontSize: 12, color: "#64748B", margin: "0 0 10px", lineHeight: 1.5 },
  calCardBody: { padding: "12px 14px" },

  // Date input row
  dateInputRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },

  // Feriado chips
  feriadoChips: { display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 },
  feriadoChip: {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "5px 10px", background: "#F1F5F9",
    border: "1px solid #E2E8F0", borderRadius: 999,
    fontSize: 12, color: "#334155", fontWeight: 500,
  },
  feriadoChipX: {
    background: "none", border: "none", cursor: "pointer",
    color: "#94A3B8", fontSize: 15, lineHeight: 1,
    padding: 0, display: "flex", alignItems: "center",
    fontFamily: "inherit",
  },
  feriadoEmpty: { fontSize: 12, color: "#94A3B8", margin: "10px 0 0" },

  // Users
  userCard: {
    display: "flex", alignItems: "flex-start", gap: 10,
    padding: "11px 14px", background: "#fff",
    borderRadius: 10, border: "0.5px solid #E2E8F0",
    borderLeft: "3px solid #CBD5E1",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    flexWrap: "wrap",
  },
  userAvatar: {
    width: 34, height: 34, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 14, fontWeight: 700, flexShrink: 0,
  },
  userInfo: { flex: 1, minWidth: 0 },
  userTopRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 },
  userName: { fontSize: 13, fontWeight: 700, color: "#0F172A", margin: 0 },
  userDetail: { fontSize: 11, color: "#64748B", margin: 0, lineHeight: 1.5 },

  // WhatsApp rows
  waInputRow: { marginTop: 6 },
  waSubRow: {
    margin: "0 0 0 44px",
    padding: "10px 14px",
    background: "#F8FAFC",
    borderRadius: "0 0 10px 10px",
    border: "0.5px solid #E2E8F0",
    borderTop: "none",
  },
  waSubRowContent: {},
  waSubLabel: { display: "block", fontSize: 11, fontWeight: 600, color: "#64748B", marginBottom: 7 },
  waInputs: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },

  // Sessions (medico / enfermeira)
  sessoesWrap: {},
  sessoesList: {
    listStyle: "none", padding: 0, margin: "0 0 8px",
    display: "flex", flexDirection: "column", gap: 6,
  },
  sessaoItem: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 8, flexWrap: "wrap",
    padding: "8px 11px", background: "#F8FAFC",
    borderRadius: 8, border: "0.5px solid #E2E8F0",
  },
  sessaoItemInfo: { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 },
  sessaoTipo: { fontSize: 12, fontWeight: 700, color: "#0F172A" },
  sessaoMeta: { fontSize: 11, color: "#64748B" },
  sessaoForm: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: 7, alignItems: "center",
    padding: "10px 12px",
    background: "#F8FAFC",
    borderRadius: 8, border: "0.5px solid #E2E8F0",
  },

  // Form
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 12, marginBottom: 14,
  },
  fieldWrap: { display: "flex", flexDirection: "column", gap: 5 },
  label: { fontSize: 12, color: "#475569", fontWeight: 600 },
  input: {
    padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
    border: "1.5px solid #E2E8F0", borderRadius: 8,
    background: "#fff", color: "#0F172A", outline: "none",
  },
  inputNum: {
    padding: "6px 9px", fontSize: 13, fontFamily: "inherit",
    border: "1.5px solid #E2E8F0", borderRadius: 7,
    width: 70, background: "#fff", outline: "none",
  },
  vagasAgendaLbl: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: 10,
    fontSize: 12, color: "#475569", flexWrap: "wrap",
  },
  vagasAgendaLblFull: {
    display: "flex", flexDirection: "column", gap: 5,
    fontSize: 12, color: "#475569", marginTop: 4,
  },
  hintMuted: { fontSize: 12, color: "#94A3B8", marginBottom: 12, lineHeight: 1.5 },

  // Buttons
  btnSalvar: {
    padding: "10px 22px", fontSize: 13, fontWeight: 700,
    border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
    background: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)", color: "#fff",
    boxShadow: "0 2px 8px rgba(67,56,202,0.28)",
  },
  btnAdd: {
    padding: "9px 16px", fontSize: 13, fontWeight: 700,
    border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
    background: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)", color: "#fff",
    boxShadow: "0 2px 8px rgba(67,56,202,0.28)",
  },
  btnSave: {
    padding: "7px 13px", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
    border: "1px solid #86EFAC", borderRadius: 7, cursor: "pointer",
    background: "#F0FDF4", color: "#166534",
  },
  btnDel: {
    padding: "7px 12px", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
    border: "1px solid #FECACA", borderRadius: 7, cursor: "pointer",
    background: "#FEF2F2", color: "#991B1B",
  },
  btnDelSm: {
    padding: "4px 9px", fontSize: 11, fontWeight: 700, fontFamily: "inherit",
    border: "1px solid #FECACA", borderRadius: 6, cursor: "pointer",
    background: "#FEF2F2", color: "#991B1B", flexShrink: 0,
  },
  btnRestore: {
    padding: "6px 12px", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
    border: "1px solid #FDE68A", borderRadius: 7, cursor: "pointer",
    background: "#FFFBEB", color: "#92400E",
  },
  btnCancelar: {
    padding: "9px 16px", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
    border: "1px solid #E2E8F0", borderRadius: 8, cursor: "pointer",
    background: "#F1F5F9", color: "#475569",
  },

  // Avatar
  avSmall: {
    width: 34, height: 34, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 12, fontWeight: 700, flexShrink: 0,
  },
};

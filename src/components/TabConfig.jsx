// src/components/TabConfig.jsx
import { useState, useEffect, useMemo } from "react";
import {
  getAllUsers,
  createUser,
  deleteUser,
  updateProfissional,
  createProfissional,
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
  } else if (modo !== AGENDA_MODO.PADRAO && modo !== defModo) {
    entry.agendaModo = modo;
    entry.diasAgendamento = deleteField();
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
      medicoSessoes: extras.medicoSessoes,
      enfermeiraSessoes: extras.enfermeiraSessoes,
    });
    try {
      await restaurarSpecKeyNaAgenda(specKey);
      if (existente?.id) {
        await updateProfissional(existente.id, {
          nome: n,
          specKey,
          ...(role ? { role } : {}),
          ...(igualAoPadraoDoCodigo
            ? { atendimentoDiasTurnos: deleteField() }
            : { atendimentoDiasTurnos: normalized }),
        });
      } else {
        await createProfissional({
          nome: n,
          specKey,
          ...(role ? { role } : {}),
          ...(isSpecKeyCustom(specKey) ? { custom: true } : {}),
          ...(igualAoPadraoDoCodigo ? {} : { atendimentoDiasTurnos: normalized }),
        });
      }
      await patchProfissionalConfigPorSpec(specKey, cfgPatch);
      if (diasAtivos.length) {
        await updateSettings({
          atendimentoDiasAtivosPorSpec: { [specKey]: diasAtivos },
        });
      }
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
          "Marque os dias da semana em que o agendamento pode ser feito (ex.: terça, quarta e quinta antes de uma sexta de atendimento).",
          "danger"
        );
        return;
      }
    }
    try {
      const docId = await createProfissional({
        nome: n,
        role,
        custom: true,
        atendimentoDiasTurnos: normalized,
      });
      const specKey = `custom_${docId}`;
      await updateProfissional(docId, { specKey });
      const cfgPatch = montarPatchProfissionalConfig(specKey, {
        agendaModo: payload.agendaModo || AGENDA_MODO.DIA_UTIL_ANTERIOR,
        vagasBase: vagas,
        role,
        isCustom: true,
        diasAgendamento: payload.diasAgendamento,
      });
      await patchProfissionalConfigPorSpec(specKey, cfgPatch);
      await updateSettings({
        atendimentoDiasAtivosPorSpec: { [specKey]: Object.keys(normalized) },
      });
      showToast(`${n} adicionado à agenda da unidade.`, "success");
    } catch {
      showToast("Erro ao cadastrar o novo profissional.", "danger");
    }
  }

  async function excluirProfissional(specKey) {
    const d = resolverDocumentoProfissional(specKey, profissionaisMap);
    const meta = SPEC_META[specKey];
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
            <em>chave de agenda</em> do sistema (médico, odontologia, etc.). No <strong>médico</strong> e na{" "}
            <strong>enfermeira</strong>, cadastre cada tipo de atendimento (ex.: PCCU, gestantes) com dia, turno e vagas.
            Nos demais,
            marque dias e turnos na UBS; <strong>Salvar</strong> grava nome, agenda e regras de agendamento.{" "}
            <strong>Excluir</strong> tira o profissional da agenda e desta lista, apagando cadastro, suspensões,
            vagas e cronograma. Use <strong>Restaurar</strong> (abaixo) para voltar a exibir na unidade. Em{" "}
            <strong>Novo profissional</strong> cadastre quem foi contratado e ainda não está na lista fixa da UBS.
          </p>
          <p style={S.hintMuted}>
            Para <strong>contas de login</strong> (agente, recepção, direção), use a aba{" "}
            <button type="button" style={S.linkTab} onClick={() => setSection("usuarios")}>
              Usuários
            </button>
            .
          </p>
          <hr style={S.sectionDivider} />
          {specKeysAtivos.length === 0 && (
            <p style={S.hintMuted}>
              Nenhum profissional ativo na grade. Restaure um perfil na seção abaixo para voltar a exibir na agenda.
            </p>
          )}
          {specKeysAtivos.map((key, i, keys) => {
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
                  profCfg={profissionalConfigPorSpec[key]}
                  isMedico={key === "medico"}
                  isEnfermeira={key === "enfermeira"}
                  pccuTotal={pccuTotal}
                  showToast={showToast}
                  onSave={(sk, nomeVal, grade, extras) => salvarNomeProfissional(sk, nomeVal, grade, extras)}
                  onDelete={excluirProfissional}
                />
              </div>
            );
          })}
          {specKeysCustomAtivos.length > 0 && (
            <>
              <hr style={S.sectionDivider} />
              <p style={S.sectionTitle}>Profissionais adicionados na unidade</p>
              {specKeysCustomAtivos.map((key) => (
                <div key={key} style={S.profBlock}>
                  <ProfRow
                    specKey={key}
                    nome={profNames[key] || "Profissional"}
                    doc={resolverDocumentoProfissional(key, profissionaisMap)}
                    profCfg={profissionalConfigPorSpec[key]}
                    isCustom
                    showToast={showToast}
                    onSave={(sk, nomeVal, grade, extras) => salvarNomeProfissional(sk, nomeVal, grade, extras)}
                    onDelete={excluirProfissional}
                  />
                </div>
              ))}
            </>
          )}

          <hr style={S.sectionDivider} />
          <NovoProfissionalForm onCreate={criarNovoProfissional} />

          {specKeysRemovidos.length > 0 && (
            <>
              <hr style={S.sectionDivider} />
              <p style={S.sectionTitle}>Removidos da agenda</p>
              <p style={S.hintMuted}>
                Estes perfis não aparecem na aba Vagas nem para os agentes. Restaure e salve o nome para reativar.
              </p>
              {specKeysRemovidos.map((key) => {
                const meta = SPEC_META[key] || {};
                return (
                  <div key={key} style={S.profRemovidoRow}>
                    <div>
                      <strong>{meta.role || key}</strong>
                      <span style={S.hintMuted}>
                        {" "}
                        — {DEFAULT_PROF_NAMES[key] || key}
                      </span>
                    </div>
                    <button type="button" style={S.btnSave} onClick={() => restaurarProfissionalNaGrade(key)}>
                      Restaurar
                    </button>
                  </div>
                );
              })}
            </>
          )}
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
              <strong>dia anterior</strong> a cada quarta de visitas, agentes de saúde e direção veem o lembrete na aba{" "}
              <strong>Avisos</strong>. Altere ou limpe a data quando precisar.
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
            <label style={S.label}>Vagas PCCU (padrão legado)</label>
            <p style={S.hintMuted}>
              Usado só enquanto a enfermeira não tiver agenda customizada salva. Prefira definir cada linha de{" "}
              <strong>PCCU</strong> no card da enfermeira (dia, turno e vagas).
            </p>
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
      <p style={S.sectionTitle}>Novo profissional</p>
      <p style={S.hintMuted}>
        Use quando alguém for contratado e precisar aparecer na agenda (além dos perfis fixos acima).
      </p>
      {!aberto ? (
        <button type="button" style={S.btnAdd} onClick={() => setAberto(true)}>
          + Adicionar profissional
        </button>
      ) : (
        <div style={S.novoProfPanel}>
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
                <option key={r} value={r}>
                  {r}
                </option>
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
          <Field label="Vagas por atendimento (turno)">
            <input
              type="number"
              min={0}
              max={99}
              style={{ ...S.input, maxWidth: 100 }}
              value={vagasBase}
              onChange={(e) => setVagasBase(Number(e.target.value))}
            />
          </Field>
          <Field label="Como funciona o agendamento">
            <select style={S.input} value={agendaModo} onChange={(e) => setAgendaModo(e.target.value)}>
              {AGENDA_MODO_OPCOES.filter((o) => o.value !== AGENDA_MODO.PADRAO).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {isModoDiasAgendamento(agendaModo) && (
            <Field label="Dias em que o agendamento fica disponível">
              <DiasAgendamentoSelector
                dias={diasAgendamento}
                onToggle={toggleDiaAgendamento}
                hint="Ex.: nutricionista atende na sexta — marque terça, quarta e quinta para liberar agendamento até 3 dias antes."
              />
            </Field>
          )}
          <p style={S.gradeTitle}>Dias e turnos na UBS</p>
          <GradeDiasTurnos gradeMap={gradeMap} onToggle={toggleTurno} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button
              type="button"
              style={{ ...S.btnAdd, opacity: saving ? 0.6 : 1 }}
              disabled={saving}
              onClick={handleCreate}
            >
              {saving ? "Cadastrando…" : "Cadastrar profissional"}
            </button>
            <button type="button" style={S.btnDel} onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DiasAgendamentoSelector({ dias, onToggle, hint }) {
  const ativos = dias || [];
  return (
    <div style={S.diasAgendamentoBox}>
      {hint ? <p style={S.gradeHint}>{hint}</p> : null}
      <div style={S.gradeList}>
        {ORDEM_DIA_SEMANA_GRADE.map((dia) => (
          <label key={dia} style={S.gradeChk}>
            <input type="checkbox" checked={ativos.includes(dia)} onChange={() => onToggle(dia)} />
            {DAY_LABEL[dia] || dia}
          </label>
        ))}
      </div>
    </div>
  );
}

function novoIdSessaoProf(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

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
    <div style={S.medicoSessoesWrap}>
      {hint ? <p style={S.gradeHint}>{hint}</p> : null}
      {sessoes.length > 0 && (
        <ul style={S.medicoSessoesList}>
          {sessoes.map((s) => (
            <li key={s.id} style={S.medicoSessaoItem}>
              <span style={S.medicoSessaoTxt}>
                <strong>{tiposMap[s[tipoField]]?.label || s[tipoField]}</strong>
                {" · "}
                {DAY_LABEL[s.dia] || s.dia}
                {" · "}
                {s.turno === "manha" ? "Manhã" : "Tarde"}
                {" · "}
                {s.vagas} vaga{s.vagas !== 1 ? "s" : ""}
              </span>
              <button type="button" style={S.btnDel} onClick={() => remover(s.id)}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={S.medicoSessaoForm}>
        <select
          style={S.input}
          value={novo[tipoField]}
          onChange={(e) => setNovo((n) => ({ ...n, [tipoField]: e.target.value }))}
        >
          {Object.entries(tiposMap).map(([k, m]) => (
            <option key={k} value={k}>
              {m.label}
            </option>
          ))}
        </select>
        <select style={S.input} value={novo.dia} onChange={(e) => setNovo((n) => ({ ...n, dia: e.target.value }))}>
          {ORDEM_DIA_SEMANA_GRADE.map((d) => (
            <option key={d} value={d}>
              {DAY_LABEL[d]}
            </option>
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
        <button type="button" style={S.btnSave} onClick={adicionar}>
          Adicionar
        </button>
      </div>
    </div>
  );
}

function GradeDiasTurnos({ gradeMap, onToggle }) {
  return (
    <div style={S.gradeList}>
      {ORDEM_DIA_SEMANA_GRADE.map((dia) => {
        const ativos = gradeMap[dia] || [];
        return (
          <div key={dia} style={S.gradeRow}>
            <span style={S.gradeDia}>{DAY_LABEL[dia] || dia}</span>
            <div style={S.gradeTurnos}>
              <label style={S.gradeChk}>
                <input
                  type="checkbox"
                  checked={ativos.includes("manha")}
                  onChange={() => onToggle(dia, "manha")}
                />
                Manhã
              </label>
              <label style={S.gradeChk}>
                <input
                  type="checkbox"
                  checked={ativos.includes("tarde")}
                  onChange={() => onToggle(dia, "tarde")}
                />
                Tarde
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  const meta = getSpecMetaForKey(specKey, {
    profissionalConfigPorSpec: { [specKey]: profCfg },
    roleFallback: doc?.role,
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

  return (
    <div style={S.profRow}>
      <div style={{ ...S.avSmall, background: meta.bg || "#F1F5F9", color: meta.tc || "#475569" }}>
        {meta.av || "?"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={S.profRole}>{meta.role || specKey}</p>
        <input style={S.input} value={val} onChange={(e) => setVal(e.target.value)} />
        {isMedico ? (
          <>
            <p style={S.gradeTitle}>Atendimentos na agenda</p>
            <ProfissionalSessoesEditor
              sessoes={medicoSessoes}
              onChange={setMedicoSessoes}
              showToast={showToast}
              tiposMap={MEDICO_TIPO}
              tipoField="medicoTipo"
              normalizeFn={normalizeMedicoSessoesConfig}
              idPrefix="ms"
              hint={
                <>
                  Cadastre cada tipo com <strong>dia</strong>, <strong>turno</strong> (manhã e tarde sempre
                  disponíveis; hoje a UBS funciona das 13h às 18h) e <strong>vagas</strong>. Ex.: gestantes, terça à
                  tarde, 6 vagas.
                </>
              }
              defaultNovo={{ medicoTipo: "clinico", dia: "segunda", turno: "tarde", vagas: 8 }}
            />
          </>
        ) : isEnfermeira ? (
          <>
            <p style={S.gradeTitle}>Atendimentos na agenda (PCCU e enfermagem)</p>
            <ProfissionalSessoesEditor
              sessoes={enfermeiraSessoes}
              onChange={setEnfermeiraSessoes}
              showToast={showToast}
              tiposMap={ENFERMEIRA_ATENDIMENTO_TIPO}
              tipoField="enfermeiraTipo"
              normalizeFn={normalizeEnfermeiraSessoesConfig}
              idPrefix="es"
              hint={
                <>
                  Informe <strong>PCCU</strong> ou <strong>enfermagem</strong>, o <strong>dia</strong>, o{" "}
                  <strong>turno</strong> (manhã/tarde) e as <strong>vagas</strong>. Ex.: PCCU, quarta à tarde, 15
                  vagas.
                </>
              }
              defaultNovo={{ enfermeiraTipo: "pccu", dia: "quarta", turno: "tarde", vagas: 15 }}
            />
          </>
        ) : (
          <>
            <p style={S.gradeTitle}>Dias e turnos na UBS (segunda a sexta)</p>
            <p style={S.gradeHint}>
              Todos os dias e os dois turnos podem ser marcados, mesmo que ainda não apareçam na grade do app — assim a
              recepção antecipa mudanças na agenda.
            </p>
            {specKey === "dentPatrick" && (
              <p style={{ ...S.profHintMuted, marginTop: 4 }}>
                Às <strong>sexta-feiras à tarde</strong> o Dr. Patrick não atende na unidade (turno reservado para{" "}
                <strong>visitas domiciliares</strong>).
              </p>
            )}
            <GradeDiasTurnos gradeMap={gradeMap} onToggle={toggleTurno} />
          </>
        )}
        <p style={S.gradeTitle}>
          {isMedico || isEnfermeira ? "Regra de agendamento" : "Vagas e agendamento"}
        </p>
        {isMedico || isEnfermeira ? null : isCustom ? (
          <div style={S.vagasAgendaRow}>
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
          <div style={S.vagasAgendaCol}>
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
        )}
        <label style={S.vagasAgendaLblFull}>
          Agendamento para agentes
          <select style={S.input} value={agendaModo} onChange={(e) => setAgendaModo(e.target.value)}>
            {AGENDA_MODO_OPCOES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {isModoDiasAgendamento(agendaModo) && (
          <>
            <p style={{ ...S.gradeTitle, marginTop: 10 }}>Dias em que o agendamento fica disponível</p>
            <DiasAgendamentoSelector
              dias={diasAgendamento}
              onToggle={toggleDiaAgendamento}
              hint="Marque os dias da semana (antes do atendimento) em que agentes e direção podem solicitar vaga — por exemplo, terça, quarta e quinta para atendimento na sexta."
            />
          </>
        )}
        {!temCadastro && (
          <p style={S.profHintMuted}>Sem cadastro no Firestore — Cadastrar cria o registro.</p>
        )}
      </div>
      <div style={S.profActions}>
        <button
          type="button"
          style={S.btnSave}
          onClick={() =>
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
                medicoSessoes: isMedico ? medicoSessoes : undefined,
                enfermeiraSessoes: isEnfermeira ? enfermeiraSessoes : undefined,
                role: isCustom ? doc?.role || meta.role : undefined,
              }
            )
          }
        >
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
  profRemovidoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    padding: "12px 0",
    borderBottom: "1px solid #E2E8F0",
  },
  profRow: { display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 0 },
  profActions: { display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 },
  profHintMuted: { fontSize: 11, color: "#94A3B8", margin: "6px 0 0" },
  gradeTitle: { fontSize: 11, fontWeight: 600, color: "#64748B", margin: "10px 0 4px" },
  gradeHint: { fontSize: 11, color: "#94A3B8", margin: "0 0 8px", lineHeight: 1.4 },
  gradeList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 4,
    padding: "8px 10px",
    background: "#F8FAFC",
    borderRadius: 8,
    border: "0.5px solid #E2E8F0",
  },
  gradeRow: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 12, color: "#334155" },
  gradeDia: { minWidth: 118, fontWeight: 500 },
  gradeTurnos: { display: "flex", gap: 12, flexWrap: "wrap" },
  gradeChk: { display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" },
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
  novoProfPanel: {
    padding: "12px 14px",
    background: "#F8FAFC",
    borderRadius: 10,
    border: "1px solid #E2E8F0",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  vagasAgendaCol: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 },
  vagasAgendaRow: { marginBottom: 8 },
  vagasAgendaLbl: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 12,
    color: "#475569",
    flexWrap: "wrap",
  },
  vagasAgendaLblFull: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    color: "#475569",
    marginTop: 4,
  },
  inputNum: {
    padding: "5px 8px",
    fontSize: 13,
    border: "1px solid #E2E8F0",
    borderRadius: 6,
    width: 72,
    background: "#fff",
  },
  diasAgendamentoBox: { marginTop: 4, marginBottom: 4 },
  medicoSessoesWrap: { marginBottom: 8 },
  medicoSessoesList: { listStyle: "none", padding: 0, margin: "0 0 10px", display: "flex", flexDirection: "column", gap: 6 },
  medicoSessaoItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
    padding: "8px 10px",
    background: "#fff",
    borderRadius: 8,
    border: "0.5px solid #E2E8F0",
    fontSize: 12,
  },
  medicoSessaoTxt: { color: "#334155", flex: 1, minWidth: 0 },
  medicoSessaoForm: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
    gap: 8,
    alignItems: "center",
  },
};

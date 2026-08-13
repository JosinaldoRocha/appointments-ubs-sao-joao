import {
  DAY_LABEL,
  DEFAULT_PROF_NAMES,
  ORDEM_DIA_SEMANA_GRADE,
  SPEC_META,
  isSpecKeyCustom,
} from "./scheduleConfig";

export const CRONOGRAMA_VERSAO = 1;
export const CRONOGRAMA_TURNOS = ["manha", "tarde"];
export const CRONOGRAMA_TURNO_LABEL = { manha: "Manhã", tarde: "Tarde" };

const MAX_NOME_PROFISSIONAL = 120;
const MAX_ITENS = 200;

/** Categorias de profissional disponíveis no cronograma (chave da agenda). */
export const CRONOGRAMA_CATEGORIAS = Object.keys(DEFAULT_PROF_NAMES).map((key) => ({
  key,
  label: SPEC_META[key]?.role || key,
}));

/** Tipos de atendimento por categoria (múltiplos por turno). */
export const CRONOGRAMA_TIPOS_POR_CATEGORIA = {
  medico: [
    { key: "clinico", label: "Atendimento clínico geral" },
    { key: "gestantes", label: "Atendimento para gestantes" },
    { key: "receitas", label: "Troca de receitas" },
    { key: "visita_domiciliar", label: "Visita domiciliar" },
  ],
  enfermeira: [
    { key: "enfermagem", label: "Atendimento de enfermagem" },
    { key: "pccu", label: "PCCU" },
  ],
  dentFernando: [
    { key: "odontologia", label: "Atendimento odontológico" },
    { key: "visita_domiciliar", label: "Visita domiciliar" },
  ],
  dentPatrick: [
    { key: "odontologia", label: "Atendimento odontológico" },
    { key: "visita_domiciliar", label: "Visita domiciliar" },
  ],
  psicologa: [{ key: "psicologia", label: "Atendimento psicológico" }],
  fisio: [{ key: "fisioterapia", label: "Atendimento de fisioterapia" }],
  nutricionista: [{ key: "nutricao", label: "Atendimento nutricional" }],
  tecnicoEnfermagem: [{ key: "coleta_exames", label: "Coleta de exames" }],
};

const CATEGORIAS_VALIDAS = new Set(CRONOGRAMA_CATEGORIAS.map((c) => c.key));
const TIPOS_VALIDOS_POR_CATEGORIA = Object.fromEntries(
  Object.entries(CRONOGRAMA_TIPOS_POR_CATEGORIA).map(([cat, arr]) => [
    cat,
    new Set(arr.map((t) => t.key)),
  ])
);

/** Profissionais cadastrados na unidade além dos perfis fixos (`specKey` = `custom_*`) não têm
 * tipos de atendimento pré-definidos — usam este tipo genérico único quando a função não bate
 * com nenhuma das conhecidas abaixo. */
const TIPO_GENERICO_CUSTOM = [{ key: "atendimento", label: "Atendimento" }];

/**
 * Função (campo "Função ou área" do cadastro em Config.) → tipos de atendimento já existentes
 * para o papel fixo equivalente. Ex.: um "Clínico Geral" cadastrado avulso (porque o médico fixo
 * foi excluído e recriado) ganha as mesmas opções (Clínico geral, Gestantes, Troca de receitas…)
 * do médico da grade em código, em vez de só um tipo genérico "Atendimento".
 */
const CRONOGRAMA_TIPOS_POR_FUNCAO = {
  "Clínico Geral": CRONOGRAMA_TIPOS_POR_CATEGORIA.medico,
  "Odontologia": CRONOGRAMA_TIPOS_POR_CATEGORIA.dentFernando,
  "Enfermagem": CRONOGRAMA_TIPOS_POR_CATEGORIA.enfermeira,
  "Psicologia": CRONOGRAMA_TIPOS_POR_CATEGORIA.psicologa,
  "Fisioterapia": CRONOGRAMA_TIPOS_POR_CATEGORIA.fisio,
  "Nutrição": CRONOGRAMA_TIPOS_POR_CATEGORIA.nutricionista,
  "Téc. Enfermagem": CRONOGRAMA_TIPOS_POR_CATEGORIA.tecnicoEnfermagem,
};

/** Rótulo de qualquer tipo conhecido (de qualquer categoria) — usado para exibir itens salvos
 * mesmo sem saber a função do profissional (ex.: badge no cronograma publicado). */
const TODOS_TIPOS_LABEL_POR_KEY = (() => {
  const map = {};
  for (const arr of Object.values(CRONOGRAMA_TIPOS_POR_CATEGORIA)) {
    for (const t of arr) map[t.key] = t.label;
  }
  for (const t of TIPO_GENERICO_CUSTOM) map[t.key] = t.label;
  return map;
})();

const TIPOS_VALIDOS_CUSTOM = new Set(Object.keys(TODOS_TIPOS_LABEL_POR_KEY));

function categoriaValida(categoria) {
  return CATEGORIAS_VALIDAS.has(categoria) || isSpecKeyCustom(categoria);
}

export function cronogramaUbsVazio() {
  return { versao: CRONOGRAMA_VERSAO, itens: [] };
}

/**
 * Tipos de atendimento disponíveis para escolher no formulário. `role` (opcional) é a função do
 * profissional (`getSpecMetaForKey(...).role`) — só importa para categorias customizadas, pra
 * decidir entre a lista específica (`CRONOGRAMA_TIPOS_POR_FUNCAO`) e o genérico.
 */
export function tiposAtendimentoParaCategoria(categoria, role) {
  if (CRONOGRAMA_TIPOS_POR_CATEGORIA[categoria]) return CRONOGRAMA_TIPOS_POR_CATEGORIA[categoria];
  if (isSpecKeyCustom(categoria)) {
    const porFuncao = role && CRONOGRAMA_TIPOS_POR_FUNCAO[String(role).trim()];
    if (porFuncao) return porFuncao;
    return TIPO_GENERICO_CUSTOM;
  }
  return [];
}

export function labelTipoAtendimento(categoria, tipoKey, role) {
  const direto = tiposAtendimentoParaCategoria(categoria, role).find((x) => x.key === tipoKey);
  if (direto) return direto.label;
  return TODOS_TIPOS_LABEL_POR_KEY[tipoKey] || tipoKey;
}

export function labelCategoria(categoria) {
  return CRONOGRAMA_CATEGORIAS.find((c) => c.key === categoria)?.label || categoria;
}

function normalizarItem(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const categoria = typeof raw.categoria === "string" ? raw.categoria.trim() : "";
  if (!categoriaValida(categoria)) return null;
  const dia = typeof raw.dia === "string" ? raw.dia.trim() : "";
  if (!ORDEM_DIA_SEMANA_GRADE.includes(dia)) return null;
  const turno = raw.turno === "manha" || raw.turno === "tarde" ? raw.turno : null;
  if (!turno) return null;
  const nome = typeof raw.nome === "string" ? raw.nome.trim().slice(0, MAX_NOME_PROFISSIONAL) : "";
  if (!nome) return null;
  const permitidos =
    TIPOS_VALIDOS_POR_CATEGORIA[categoria] ||
    (isSpecKeyCustom(categoria) ? TIPOS_VALIDOS_CUSTOM : new Set());
  const tipos = [
    ...new Set(
      (Array.isArray(raw.tipos) ? raw.tipos : [])
        .filter((t) => typeof t === "string" && permitidos.has(t))
        .sort()
    ),
  ];
  if (!tipos.length) return null;
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim().slice(0, 80)
      : `${categoria}_${dia}_${turno}_${nome.slice(0, 20)}`;
  return { id, categoria, nome, dia, turno, tipos };
}

export function normalizeCronogramaUbs(raw) {
  if (raw == null) return cronogramaUbsVazio();
  if (typeof raw === "string") return cronogramaUbsVazio();
  if (typeof raw !== "object" || Array.isArray(raw)) return cronogramaUbsVazio();
  const itensRaw = Array.isArray(raw.itens) ? raw.itens : [];
  const itens = [];
  for (const item of itensRaw) {
    const n = normalizarItem(item);
    if (n) itens.push(n);
    if (itens.length >= MAX_ITENS) break;
  }
  itens.sort(ordenarItensCronograma);
  return { versao: CRONOGRAMA_VERSAO, itens };
}

function ordenarItensCronograma(a, b) {
  const di = ORDEM_DIA_SEMANA_GRADE.indexOf(a.dia) - ORDEM_DIA_SEMANA_GRADE.indexOf(b.dia);
  if (di !== 0) return di;
  const ti = CRONOGRAMA_TURNOS.indexOf(a.turno) - CRONOGRAMA_TURNOS.indexOf(b.turno);
  if (ti !== 0) return ti;
  const cn = a.nome.localeCompare(b.nome, "pt-BR");
  if (cn !== 0) return cn;
  return a.categoria.localeCompare(b.categoria, "pt-BR");
}

export function cronogramaUbsIguais(a, b) {
  const na = normalizeCronogramaUbs(a);
  const nb = normalizeCronogramaUbs(b);
  if (na.itens.length !== nb.itens.length) return false;
  for (let i = 0; i < na.itens.length; i++) {
    const x = na.itens[i];
    const y = nb.itens[i];
    if (
      x.id !== y.id ||
      x.categoria !== y.categoria ||
      x.nome !== y.nome ||
      x.dia !== y.dia ||
      x.turno !== y.turno ||
      x.tipos.join(",") !== y.tipos.join(",")
    ) {
      return false;
    }
  }
  return true;
}

export function cronogramaTemItens(cronograma) {
  return normalizeCronogramaUbs(cronograma).itens.length > 0;
}

/** Chave estável para agrupar itens do mesmo profissional (categoria + nome). */
export function chaveProfissionalCronograma(categoria, nome) {
  return `${categoria}::${String(nome || "").trim()}`;
}

/** Profissionais distintos no cronograma, ordenados por categoria e nome. */
export function profissionaisUnicosNoCronograma(cronograma) {
  const seen = new Map();
  for (const item of normalizeCronogramaUbs(cronograma).itens) {
    const k = chaveProfissionalCronograma(item.categoria, item.nome);
    if (!seen.has(k)) {
      seen.set(k, { categoria: item.categoria, nome: item.nome, chave: k });
    }
  }
  return [...seen.values()].sort((a, b) => {
    const ca = labelCategoria(a.categoria).localeCompare(labelCategoria(b.categoria), "pt-BR");
    if (ca !== 0) return ca;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

export function itemPertenceAoProfissional(item, prof) {
  if (!prof) return true;
  return chaveProfissionalCronograma(item.categoria, item.nome) === prof.chave;
}

export function filtrarMapaCronogramaPorProfissional(mapa, prof) {
  if (!prof) return mapa;
  const out = {};
  for (const dia of ORDEM_DIA_SEMANA_GRADE) {
    out[dia] = { manha: [], tarde: [] };
    for (const turno of CRONOGRAMA_TURNOS) {
      out[dia][turno] = (mapa[dia]?.[turno] || []).filter((item) => itemPertenceAoProfissional(item, prof));
    }
  }
  return out;
}

export function itensCronogramaPorDiaTurno(cronograma) {
  const mapa = {};
  for (const dia of ORDEM_DIA_SEMANA_GRADE) {
    mapa[dia] = { manha: [], tarde: [] };
  }
  for (const item of normalizeCronogramaUbs(cronograma).itens) {
    mapa[item.dia][item.turno].push(item);
  }
  return mapa;
}

export function novoItemCronogramaRascunho(categoria = "medico") {
  const tipos = tiposAtendimentoParaCategoria(categoria);
  return {
    id: "",
    categoria,
    nome: DEFAULT_PROF_NAMES[categoria] || "",
    dia: "segunda",
    turno: "tarde",
    tipos: tipos[0] ? [tipos[0].key] : [],
  };
}

export function validarItemCronogramaRascunho(item) {
  const n = normalizarItem({ ...item, id: item.id || "novo" });
  if (!n) return "Preencha nome, categoria, dia, turno e ao menos um tipo de atendimento.";
  return null;
}

export function prepararItemCronogramaParaSalvar(item, id) {
  const n = normalizarItem({ ...item, id: id || item.id || `item_${Date.now()}` });
  return n;
}

export { DAY_LABEL, ORDEM_DIA_SEMANA_GRADE };

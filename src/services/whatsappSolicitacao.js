// src/services/whatsappSolicitacao.js
import { digitosCpfOuSus, formatarCpfOuSusDigitos } from "../utils/documentoCpfSus";
import { MEDICO_TIPO } from "./scheduleConfig";

/** Bom dia (antes de 12h) ou Boa tarde (a partir de 12h). */
export function saudacaoBomDiaOuTarde() {
  return new Date().getHours() < 12 ? "Bom dia" : "Boa tarde";
}

export function saudacaoPorHora() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function formatDataNascimentoBR(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || "";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export function formatarDiaAtendimentoLongo(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || "—";
  return new Date(isoDate + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Primeira letra do dia da semana em maiúscula (ex.: "Segunda-feira, …"). */
function dataAtendimentoComTitulo(isoDate) {
  const long = formatarDiaAtendimentoLongo(isoDate);
  if (!long || long === "—") return long;
  return long.charAt(0).toUpperCase() + long.slice(1);
}

/**
 * Ex.: "Manhã – Troca de receitas" → turno "Manhã" e observação "Troca de receitas".
 * Se não houver separador, o texto inteiro vai em turno.
 */
export function splitTurnoObservacao(sessLabel) {
  const s = (sessLabel || "").trim();
  if (!s) return { turno: "—", observacao: "" };
  const m = s.match(/^(.+?)\s*[–—\-]\s*(.+)$/);
  if (m) {
    return { turno: m[1].trim(), observacao: m[2].trim() };
  }
  return { turno: s, observacao: "" };
}

function linhaCpfOuCartaoSus(documentoPaciente) {
  const d = digitosCpfOuSus(documentoPaciente);
  if (d.length === 11) return `CPF: ${formatarCpfOuSusDigitos(d)}`;
  if (d.length === 15) return `Cartão do SUS: ${formatarCpfOuSusDigitos(d)}`;
  return "";
}

/**
 * Texto único do campo "Observação" na mensagem: prioriza o que o agente digitou no modal;
 * se vazio, usa o tipo de atendimento do médico (receitas / clínico / gestantes); senão, o
 * complemento do rótulo da sessão (ex.: PCCU, enfermagem) quando existir.
 */
function textoLinhaObservacao(observacaoExtra, sessLabel, medicoTipo) {
  const extra = (observacaoExtra || "").trim();
  if (extra) return extra;
  const tipo = medicoTipo && MEDICO_TIPO[medicoTipo]?.label;
  if (tipo) return tipo;
  const { observacao: obsSessao } = splitTurnoObservacao(sessLabel);
  return (obsSessao || "").trim();
}

/**
 * PCCU com a enfermeira: flag `pccuOnly` na grade ou turno “… PCCU” no rótulo.
 */
export function isSessaoPccuEnfermeira({ pccuOnly, specKey, sessLabel }) {
  if (pccuOnly === true) return true;
  if (specKey === "enfermeira" && /\bPCCU\b/i.test(String(sessLabel || ""))) return true;
  return false;
}

/** Troca de receitas, gestantes ou PCCU (enfermeira) — mensagem de encaixe personalizada. */
export function encaixeCasosEspecificos({ medicoTipo, pccuOnly, specKey, sessLabel }) {
  return (
    isSessaoPccuEnfermeira({ pccuOnly, specKey, sessLabel }) ||
    medicoTipo === "receitas" ||
    medicoTipo === "gestantes"
  );
}

/**
 * Texto quando só restam vagas de encaixe (tela agente, modal, WhatsApp).
 * Casos específicos: gestantes, troca de receitas, PCCU com enfermeira. Demais: texto genérico.
 */
export function fraseVagasEsgotadasEncaixe({ livres, medicoTipo, pccuOnly, specKey, sessLabel }) {
  const n = Math.max(0, Number(livres) || 0);
  const enc = n === 1 ? "encaixe" : "encaixes";
  const ctx = { medicoTipo, pccuOnly, specKey, sessLabel };
  if (!encaixeCasosEspecificos(ctx)) {
    return `Vagas esgotadas. Restam apenas ${n} ${enc} para paciente da zona rural ou casos agudos.`;
  }
  let alvo = "";
  if (isSessaoPccuEnfermeira({ pccuOnly, specKey, sessLabel })) alvo = "exame PCCU";
  else if (medicoTipo === "gestantes") alvo = "gestantes";
  else if (medicoTipo === "receitas") alvo = "troca de receitas";
  return `Vagas esgotadas. Restam apenas ${n} ${enc} para ${alvo} da zona rural ou casos agudos.`;
}

/** Rótulo curto para o título do modal (só nos três casos). */
export function rotuloEncaixeModal({ medicoTipo, pccuOnly, specKey, sessLabel }) {
  const ctx = { medicoTipo, pccuOnly, specKey, sessLabel };
  if (!encaixeCasosEspecificos(ctx)) return "";
  if (isSessaoPccuEnfermeira({ pccuOnly, specKey, sessLabel })) return "PCCU";
  if (medicoTipo === "gestantes") return "Gestantes";
  if (medicoTipo === "receitas") return "Troca de receitas";
  return "";
}

/** Legenda na recepção: encaixe por programa (só nos três casos). */
export function fraseIncluiEncaixeRecepcao({ encaixeExtra, medicoTipo, pccuOnly, specKey, sessLabel }) {
  const n = Math.max(0, Number(encaixeExtra) || 0);
  const enc = n === 1 ? "encaixe" : "encaixes";
  const ctx = { medicoTipo, pccuOnly, specKey, sessLabel };
  if (!encaixeCasosEspecificos(ctx)) {
    return `Inclui ${n} vaga(s) de encaixe (urgência / zona rural), além da agenda fixa.`;
  }
  let alvo = "";
  if (isSessaoPccuEnfermeira({ pccuOnly, specKey, sessLabel })) alvo = "exame PCCU";
  else if (medicoTipo === "gestantes") alvo = "gestantes";
  else if (medicoTipo === "receitas") alvo = "troca de receitas";
  return `Inclui ${n} ${enc} para ${alvo} da zona rural ou casos agudos (além da agenda fixa).`;
}

function blocoRodapeAgenda(profLinha, atendimentoDate, sessLabel, observacaoExtra, medicoTipo) {
  const { turno } = splitTurnoObservacao(sessLabel);
  const dataCap = dataAtendimentoComTitulo(atendimentoDate);
  let s =
    `Profissional: ${profLinha}\n` +
    `Data: ${dataCap}\n` +
    `Turno: ${turno}`;
  const obs = textoLinhaObservacao(observacaoExtra, sessLabel, medicoTipo);
  if (obs) {
    s += `\nObservação: ${obs}`;
  }
  return s;
}

/**
 * @param {object} p
 * @param {string} p.profissionalLinha — nome e função do profissional
 * @param {string} p.sessLabel — turno (e opcionalmente observação após " – ")
 * @param {string} [p.atendimentoDate] — YYYY-MM-DD
 * @param {string} [p.paciente]
 * @param {string} [p.dataNascimentoIso]
 * @param {string} [p.documentoPaciente]
 * @param {string} [p.fotoDocumentoUrl]
 * @param {boolean} [p.solicitacaoFisioEncaminhamento] — fisioterapia com lista de espera + encaminhamento obrigatório
 * @param {string} [p.telefonePaciente]
 * @param {string} [p.nomeAgenteSaude]
 * @param {string} [p.observacaoExtra] — texto livre do solicitante (modal)
 * @param {string} [p.medicoTipo] — chave MEDICO_TIPO quando a sessão é do médico (receitas, clinico, gestantes)
 * @param {boolean} [p.somenteEncaixe] — só restam vagas de encaixe (zona rural / agudos)
 * @param {number} [p.livresEncaixe] — quantidade de encaixes ainda livres (para texto do encaixe)
 * @param {boolean} [p.pccuOnly] — sessão PCCU
 */
export function montarMensagemSolicitacaoWhatsApp(p) {
  const saud = saudacaoBomDiaOuTarde();
  const profLinha = (p.profissionalLinha || "").trim() || "—";
  const rodape = blocoRodapeAgenda(
    profLinha,
    p.atendimentoDate,
    p.sessLabel,
    p.observacaoExtra,
    p.medicoTipo
  );

  const linhaPedido = p.somenteEncaixe
    ? `Agendar encaixe para:\n`
    : `Agenda um atendimento para:\n`;

  if (p.solicitacaoFisioEncaminhamento) {
    const nome = (p.paciente || "").trim() || "—";
    const docLinha = linhaCpfOuCartaoSus(p.documentoPaciente);
    const telFmt = (p.telefonePaciente || "").trim() || "—";
    const agente = (p.nomeAgenteSaude || "").trim() || "—";
    const url = (p.fotoDocumentoUrl || "").trim() || "—";
    let corpo =
      `${saud}!\n\n` +
      `Agenda um atendimento para:\n` +
      `Paciente: ${nome}\n`;
    if (docLinha) {
      corpo += `${docLinha}\n`;
    }
    corpo +=
      `Telefone: ${telFmt}\n` +
      `Agente de saúde: ${agente}\n\n` +
      `Encaminhamento (foto) — abra o link para ver a imagem:\n${url}\n\n` +
      rodape;
    return corpo;
  }

  if (p.fotoDocumentoUrl) {
    const url = (p.fotoDocumentoUrl || "").trim();
    return (
      `${saud}!\n\n` +
      linhaPedido +
      `${url}\n\n` +
      rodape
    );
  }

  const nome = (p.paciente || "").trim() || "—";
  const docLinha = linhaCpfOuCartaoSus(p.documentoPaciente);
  const dn = p.dataNascimentoIso ? formatDataNascimentoBR(p.dataNascimentoIso) : "—";

  let corpo =
    `${saud}!\n\n` +
    linhaPedido +
    `Paciente: ${nome}\n`;
  if (docLinha) {
    corpo += `${docLinha}\n`;
  }
  corpo += `Data de nascimento: ${dn}\n\n` + rodape;
  return corpo;
}

/**
 * O link wa.me exige número em formato internacional (E.164 sem +). No cadastro usamos
 * apenas DDD + número (BR). No app do WhatsApp no celular, número sem código do país
 * costuma falhar; no desktop às vezes funciona por diferença do cliente.
 * @returns {string|null}
 */
export function normalizarTelefoneParaWaMe(telefoneDigitos) {
  const d = String(telefoneDigitos || "").replace(/\D/g, "");
  if (d.length < 10) return null;
  if (d.startsWith("55") && d.length >= 12 && d.length <= 13) return d;
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  return d.length >= 10 ? d : null;
}

/** URL do wa.me ou null se o telefone for inválido. */
export function buildWhatsAppUrl(telefoneDigitos, texto) {
  const phone = normalizarTelefoneParaWaMe(telefoneDigitos);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(texto)}`;
}

export function abrirWhatsAppComTexto(telefoneDigitos, texto) {
  const url = buildWhatsAppUrl(telefoneDigitos, texto);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/**
 * Após upload assíncrono, o navegador pode bloquear `window.open`.
 * Abra `about:blank` no clique e passe a janela aqui para navegar ao wa.me depois.
 */
export function abrirWhatsAppNavegandoJanela(janela, telefoneDigitos, texto) {
  const url = buildWhatsAppUrl(telefoneDigitos, texto);
  if (!url) return false;
  if (janela && !janela.closed) {
    try {
      janela.location.href = url;
      return true;
    } catch {
      /* noop — fallback abaixo */
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

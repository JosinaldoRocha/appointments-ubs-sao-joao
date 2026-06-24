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

/** URLs de fotos anexadas (array ou campo legado com uma URL). */
function urlsFotosDocumento(p) {
  if (Array.isArray(p.fotoDocumentoUrls) && p.fotoDocumentoUrls.length) {
    return p.fotoDocumentoUrls.map((u) => String(u || "").trim()).filter(Boolean);
  }
  const one = (p.fotoDocumentoUrl || "").trim();
  return one ? [one] : [];
}

function textoBlocoPedidoExameFotos(urls) {
  if (!urls.length) {
    return "Pedido de exame (foto) — abra o link para ver a imagem:\n—";
  }
  if (urls.length === 1) {
    return `Pedido de exame (foto) — abra o link para ver a imagem:\n${urls[0]}`;
  }
  return (
    `Pedidos de exame (fotos) — abra os links para ver as imagens:\n` +
    urls.map((u, i) => `${i + 1}. ${u}`).join("\n")
  );
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
 * @param {string[]} [p.fotoDocumentoUrls] — várias fotos (ex.: pedidos de exame)
 * @param {boolean} [p.solicitacaoFisioEncaminhamento] — fisioterapia com lista de espera + encaminhamento obrigatório
 * @param {boolean} [p.solicitacaoColetaExames] — coleta de exames com pedido (foto) + dados do paciente
 * @param {string} [p.telefonePaciente]
 * @param {string} [p.nomeAgenteSaude]
 * @param {string} [p.observacaoExtra] — texto livre do solicitante (modal)
 * @param {string} [p.medicoTipo] — chave MEDICO_TIPO quando a sessão é do médico (receitas, clinico, gestantes)
 * @param {boolean} [p.somenteEncaixe] — só restam vagas de encaixe (zona rural / agudos)
 * @param {number} [p.livresEncaixe] — quantidade de encaixes ainda livres (para texto do encaixe)
 * @param {boolean} [p.pccuOnly] — sessão PCCU
 * @param {boolean} [p.coletaExamesRotina] — solicitação de coleta de exames com pedido anexado
 * @param {string} [p.cartaoSusUrl] — URL da foto do cartão do SUS (coleta de exames, opcional)
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

  if (p.solicitacaoColetaExames) {
    const nome = (p.paciente || "").trim();
    const docLinha = linhaCpfOuCartaoSus(p.documentoPaciente);
    const dn = p.dataNascimentoIso ? formatDataNascimentoBR(p.dataNascimentoIso) : "";
    const cartaoSusUrl = (p.cartaoSusUrl || "").trim();
    const urls = urlsFotosDocumento(p);

    const linhasIdentidade = [];
    if (nome) linhasIdentidade.push(`Paciente: ${nome}`);
    if (docLinha) linhasIdentidade.push(docLinha);
    if (dn) linhasIdentidade.push(`Data de nascimento: ${dn}`);
    const identidade = linhasIdentidade.join("\n");

    let corpo = `${saud}!\n\nAgenda um atendimento para:`;
    if (identidade) corpo += `\n${identidade}`;
    if (cartaoSusUrl) {
      corpo += `\n\nCartão do SUS (foto) — abra o link para ver a imagem:\n${cartaoSusUrl}`;
    }
    corpo += `\n\n${textoBlocoPedidoExameFotos(urls)}\n\n` + rodape;
    return corpo;
  }

  const urlsDoc = urlsFotosDocumento(p);
  if (urlsDoc.length) {
    const blocoAnexo = p.coletaExamesRotina
      ? `${textoBlocoPedidoExameFotos(urlsDoc)}\n\n`
      : `${urlsDoc.join("\n")}\n\n`;
    return `${saud}!\n\n` + linhaPedido + blocoAnexo + rodape;
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

/**
 * Deep link para abrir o app do WhatsApp diretamente quando disponível.
 * Android usa intent:// (tratado pelo Chrome como intent do sistema).
 * iOS usa whatsapp:// (tratado pelo Safari via custom URL scheme).
 */
function buildWhatsAppDeepLink(telefoneDigitos, texto, fallbackUrl) {
  const phone = normalizarTelefoneParaWaMe(telefoneDigitos);
  if (!phone) return null;
  if (/android/i.test(navigator.userAgent)) {
    const fb = fallbackUrl || `https://wa.me/${phone}?text=${encodeURIComponent(texto)}`;
    return (
      `intent://send?phone=${phone}&text=${encodeURIComponent(texto)}` +
      `#Intent;scheme=whatsapp;package=com.whatsapp;` +
      `S.browser_fallback_url=${encodeURIComponent(fb)};end`
    );
  }
  return `whatsapp://send?phone=${phone}&text=${encodeURIComponent(texto)}`;
}

export function abrirWhatsAppComTexto(telefoneDigitos, texto) {
  const fallbackUrl = buildWhatsAppUrl(telefoneDigitos, texto);
  if (!fallbackUrl) return false;
  const isAndroid = /android/i.test(navigator.userAgent);
  const deepLink = buildWhatsAppDeepLink(telefoneDigitos, texto, fallbackUrl);
  const win = window.open(deepLink || fallbackUrl, "_blank");
  if (!win) return false;
  // No Android o intent:// já embute o fallback; no iOS é necessário redirecionar manualmente.
  if (deepLink && !isAndroid) {
    setTimeout(() => {
      try {
        if (!win.closed) win.location.replace(fallbackUrl);
      } catch {
        /* noop */
      }
    }, 1200);
  }
  return true;
}

/**
 * Após upload assíncrono, o navegador pode bloquear `window.open`.
 * Abra `about:blank` no clique e passe a janela aqui para navegar ao WhatsApp depois.
 *
 * No Android, qualquer navegação programática (location.href / window.open após async) não
 * aciona o sistema de intents de forma confiável. A única abordagem garantida é um toque real
 * do usuário num <a href>. Por isso, no Android escrevemos um botão de link na aba em branco;
 * quando o usuário toca, o Chrome trata como navegação iniciada pelo usuário e abre o WhatsApp.
 */
export function abrirWhatsAppNavegandoJanela(janela, telefoneDigitos, texto) {
  const fallbackUrl = buildWhatsAppUrl(telefoneDigitos, texto);
  if (!fallbackUrl) return false;
  const isAndroid = /android/i.test(navigator.userAgent);
  const deepLink = buildWhatsAppDeepLink(telefoneDigitos, texto, fallbackUrl);
  const targetUrl = deepLink || fallbackUrl;

  if (isAndroid && janela && !janela.closed) {
    try {
      const href = targetUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      janela.document.open();
      janela.document.write(
        "<!DOCTYPE html><html><head>" +
          '<meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          "<title>Abrindo WhatsApp…</title>" +
          "</head><body style=\"margin:0;display:flex;align-items:center;justify-content:center;" +
          "min-height:100vh;background:#f0fdf4;font-family:sans-serif\">" +
          "<div style=\"text-align:center;padding:32px 24px\">" +
          "<p style=\"font-size:16px;color:#166534;margin:0 0 24px;line-height:1.5\">" +
          "Mensagem pronta!<br>Toque no botão para abrir o WhatsApp.</p>" +
          "<a href=\"" + href + "\" " +
          "onclick=\"setTimeout(function(){try{window.close()}catch(e){}},800)\" " +
          "style=\"display:inline-block;padding:16px 28px;background:#25D366;color:#fff;" +
          "text-decoration:none;border-radius:12px;font-size:17px;font-weight:700\">" +
          "Abrir WhatsApp</a>" +
          "</div></body></html>"
      );
      janela.document.close();
      return true;
    } catch {
      /* noop — fallback abaixo */
    }
  }

  if (isAndroid) {
    try { if (janela && !janela.closed) janela.close(); } catch { /* noop */ }
    window.open(targetUrl, "_blank");
    return true;
  }

  if (janela && !janela.closed) {
    try {
      janela.location.href = targetUrl;
      if (deepLink) {
        setTimeout(() => {
          try {
            if (!janela.closed) janela.location.replace(fallbackUrl);
          } catch {
            /* noop */
          }
        }, 1200);
      }
      return true;
    } catch {
      /* noop — fallback abaixo */
    }
  }
  const win = window.open(targetUrl, "_blank");
  if (!win) return false;
  if (deepLink) {
    setTimeout(() => {
      try {
        if (!win.closed) win.location.replace(fallbackUrl);
      } catch {
        /* noop */
      }
    }, 1200);
  }
  return true;
}

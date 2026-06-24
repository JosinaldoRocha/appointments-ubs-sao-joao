// src/components/ModalAgendar.jsx
import { useState, useEffect, useRef } from "react";
import {
  SPEC_META,
  toDateStr,
  estaDentroJanelaSolicitacaoAgendamento,
  msgForaJanelaSolicitacaoAgendamento,
  msgForaDiaAgendamentoPrev,
} from "../services/scheduleConfig";
import {
  fraseVagasEsgotadasEncaixe,
  rotuloEncaixeModal,
} from "../services/whatsappSolicitacao";
import {
  digitosCpfOuSus,
  formatarCpfOuSusDigitos,
  isCpfOuCartaoSusCompleto,
  LABEL_CPF_SUS,
  PLACEHOLDER_CPF_SUS,
  ERRO_CPF_SUS_INCOMPLETO,
} from "../utils/documentoCpfSus";
import { SessaoLabelComDestaqueTurno } from "./SessaoLabelDestaqueTurno";

const MAX_FOTOS_PEDIDO_EXAME = 10;
const MAX_TAMANHO_FOTO_BYTES = 5.5 * 1024 * 1024;

export default function ModalAgendar({
  ctx,
  profNames,
  onSubmit,
  onClose,
  onConfirmarVaga = () => {},
  onCancelarAposEnvio = () => {},
  recepcaoWhatsappOk,
  direcaoEncaixeWhatsappOk = false,
  isDiretor = false,
  profissionalConfigPorSpec = {},
}) {
  const nascimentoPickerRef = useRef(null);
  const [paciente, setPaciente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [dataNascimentoInput, setDataNascimentoInput] = useState("");
  const [documentoPaciente, setDocumentoPaciente] = useState("");
  const [docFile, setDocFile] = useState(null);
  const [docPreview, setDocPreview] = useState(null);
  /** Coleta de exames: várias fotos do pedido na mesma solicitação */
  const [pedidoExameFiles, setPedidoExameFiles] = useState([]);
  const [pedidoExamePreviews, setPedidoExamePreviews] = useState([]);
  /** Coleta de exames: foto opcional do cartão do SUS (substitui campos de texto) */
  const [cartaoSusFile, setCartaoSusFile] = useState(null);
  const [cartaoSusPreview, setCartaoSusPreview] = useState(null);
  /** Fisioterapia: encaminhamento obrigatório (foto) */
  const [encaminhamentoFile, setEncaminhamentoFile] = useState(null);
  const [encaminhamentoPreview, setEncaminhamentoPreview] = useState(null);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [fase, setFase] = useState("form");
  const [confirmando, setConfirmando] = useState(false);
  const [agoraExpediente, setAgoraExpediente] = useState(() => new Date());
  const foraJanelaSolicitacao = !estaDentroJanelaSolicitacaoAgendamento(
    ctx.windowType,
    agoraExpediente,
    ctx.specKey
  );
  const foraDiaAgendamento =
    ctx.windowType === "prev" && ctx.podeAgendarPrev === false;
  const msgForaDia =
    foraDiaAgendamento
      ? msgForaDiaAgendamentoPrev(
          { key: ctx.specKey, agendaQualquerDiaUtil: ctx.agendaQualquerDiaUtil },
          profissionalConfigPorSpec
        )
      : "";

  useEffect(() => {
    const t = setInterval(() => setAgoraExpediente(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  /** Data local máxima para nascimento: hoje (não permite datas futuras). */
  const maxDataNascimento = toDateStr(new Date());

  const isFisioSolicitacao = ctx.specKey === "fisio" || ctx.key === "fisio";
  const isColetaExamesRotina =
    ctx.coletaExamesRotina === true ||
    (ctx.specKey === "tecnicoEnfermagem" && /\bcoleta de exames\b/i.test(String(ctx.sessLabel || "")));
  const isEncaminhamentoObrigatorio =
    ctx.solicitacaoEncaminhamentoObrigatorio === true || isFisioSolicitacao;
  const isSomenteEncaixe = ctx.somenteEncaixe === true;
  const encaixeParaDirecao = isSomenteEncaixe && !isDiretor;
  const textoDestinoWa = encaixeParaDirecao ? "direção" : "recepção";
  const rotuloModalEncaixe = rotuloEncaixeModal({
    medicoTipo: ctx.medicoTipo,
    pccuOnly: ctx.pccuOnly,
    specKey: ctx.specKey,
    sessLabel: ctx.sessLabel,
  });
  const nome = profNames[ctx.specKey] || ctx.specKey || "Fisioterapeuta";
  const meta = SPEC_META[ctx.specKey] || {};
  const dataAtendimentoFmt =
    ctx.atendimentoDate &&
    new Date(ctx.atendimentoDate + "T12:00:00").toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  useEffect(() => {
    setPaciente("");
    setTelefone("");
    setDataNascimento("");
    setDataNascimentoInput("");
    setDocumentoPaciente("");
    setDocFile(null);
    setDocPreview(null);
    setPedidoExameFiles([]);
    setPedidoExamePreviews([]);
    setCartaoSusFile(null);
    setCartaoSusPreview(null);
    setEncaminhamentoFile(null);
    setEncaminhamentoPreview(null);
    setObservacao("");
    setErro("");
    setEnviando(false);
    setFase("form");
    setConfirmando(false);
    setAgoraExpediente(new Date());
  }, [
    ctx.type,
    ctx.specKey,
    ctx.dayKey,
    ctx.sessIdx,
    ctx.solicitacaoEncaminhamentoObrigatorio,
    ctx.somenteEncaixe,
    ctx.pccuOnly,
    ctx.livresEncaixe,
    ctx.sessLabel,
    ctx.windowType,
  ]);

  useEffect(() => {
    if (dataNascimento && dataNascimentoInput !== formatarDataIsoParaBr(dataNascimento)) {
      setDataNascimentoInput(formatarDataIsoParaBr(dataNascimento));
    }
  }, [dataNascimento, dataNascimentoInput]);

  useEffect(() => {
    if (!docFile) {
      setDocPreview(null);
      return;
    }
    const url = URL.createObjectURL(docFile);
    setDocPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [docFile]);

  useEffect(() => {
    if (!encaminhamentoFile) {
      setEncaminhamentoPreview(null);
      return;
    }
    const url = URL.createObjectURL(encaminhamentoFile);
    setEncaminhamentoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [encaminhamentoFile]);

  useEffect(() => {
    if (!cartaoSusFile) {
      setCartaoSusPreview(null);
      return;
    }
    const url = URL.createObjectURL(cartaoSusFile);
    setCartaoSusPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cartaoSusFile]);

  useEffect(() => {
    if (!pedidoExameFiles.length) {
      setPedidoExamePreviews([]);
      return;
    }
    const urls = pedidoExameFiles.map((f) => URL.createObjectURL(f));
    setPedidoExamePreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [pedidoExameFiles]);

  function handleDocumentoCpfSus(val) {
    const d = digitosCpfOuSus(val);
    setDocumentoPaciente(formatarCpfOuSusDigitos(d));
  }

  function handleTel(v) {
    const d = v.replace(/\D/g, "").slice(0, 11);
    const f =
      d.length <= 10
        ? d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3")
        : d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
    setTelefone(f);
  }

  function formatarDataIsoParaBr(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const [ano, mes, dia] = iso.split("-");
    return `${dia}/${mes}/${ano}`;
  }

  function dataBrParaIsoValorFinal(valorBr) {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(valorBr)) return "";
    const [diaStr, mesStr, anoStr] = valorBr.split("/");
    const dia = Number(diaStr);
    const mes = Number(mesStr);
    const ano = Number(anoStr);
    if (!dia || !mes || !ano || mes < 1 || mes > 12 || dia < 1 || dia > 31) return "";
    const iso = `${anoStr}-${mesStr}-${diaStr}`;
    const dt = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return "";
    if (dt.getFullYear() !== ano || dt.getMonth() + 1 !== mes || dt.getDate() !== dia) return "";
    return iso;
  }

  function handleDataNascimentoDigitada(v) {
    const digitos = v.replace(/\D/g, "").slice(0, 8);
    let formatado = digitos;
    if (digitos.length > 4) {
      formatado = `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
    } else if (digitos.length > 2) {
      formatado = `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
    }

    setDataNascimentoInput(formatado);

    if (digitos.length === 8) {
      const iso = dataBrParaIsoValorFinal(formatado);
      if (iso) {
        setDataNascimento(iso > maxDataNascimento ? maxDataNascimento : iso);
        return;
      }
    }
    setDataNascimento("");
  }

  function abrirSeletorNascimento() {
    const el = nascimentoPickerRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      el.showPicker();
      return;
    }
    el.click();
  }

  function onPickDoc(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErro("Selecione um arquivo de imagem.");
      return;
    }
    if (f.size > MAX_TAMANHO_FOTO_BYTES) {
      setErro("Imagem muito grande (máx. 5 MB).");
      return;
    }
    setErro("");
    setDocFile(f);
  }

  function onPickPedidoExame(e) {
    const incoming = Array.from(e.target.files || []);
    e.target.value = "";
    if (!incoming.length) return;

    const validos = [];
    for (const f of incoming) {
      if (!f.type.startsWith("image/")) {
        setErro("Selecione apenas arquivos de imagem.");
        return;
      }
      if (f.size > MAX_TAMANHO_FOTO_BYTES) {
        setErro("Cada imagem deve ter no máximo 5 MB.");
        return;
      }
      validos.push(f);
    }

    const slotsLivres = MAX_FOTOS_PEDIDO_EXAME - pedidoExameFiles.length;
    if (slotsLivres <= 0) {
      setErro(`É possível anexar até ${MAX_FOTOS_PEDIDO_EXAME} fotos por solicitação.`);
      return;
    }
    const adicionar = validos.slice(0, slotsLivres);
    if (validos.length > slotsLivres) {
      setErro(
        `Só couberam mais ${slotsLivres} foto(s). O limite é ${MAX_FOTOS_PEDIDO_EXAME} por solicitação.`
      );
    } else {
      setErro("");
    }
    setPedidoExameFiles((prev) => [...prev, ...adicionar]);
  }

  function removerPedidoExame(indice) {
    setPedidoExameFiles((prev) => prev.filter((_, i) => i !== indice));
  }

  function limparPedidosExame() {
    setPedidoExameFiles([]);
  }

  function onPickCartaoSus(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErro("Selecione um arquivo de imagem.");
      return;
    }
    if (f.size > MAX_TAMANHO_FOTO_BYTES) {
      setErro("Imagem muito grande (máx. 5 MB).");
      return;
    }
    setErro("");
    setCartaoSusFile(f);
  }

  function limparCartaoSus() {
    setCartaoSusFile(null);
  }

  function onPickEncaminhamento(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErro("Selecione uma foto do encaminhamento (imagem).");
      return;
    }
    if (f.size > 5.5 * 1024 * 1024) {
      setErro("Imagem muito grande (máx. 5 MB).");
      return;
    }
    setErro("");
    setEncaminhamentoFile(f);
  }

  function limparFoto() {
    setDocFile(null);
  }

  function limparEncaminhamento() {
    setEncaminhamentoFile(null);
  }

  async function confirmar() {
    setConfirmando(true);
    try {
      await onConfirmarVaga({
        specKey: ctx.specKey,
        dayKey: ctx.dayKey,
        sessIdx: ctx.sessIdx,
        atendimentoDate: ctx.atendimentoDate,
      });
    } catch {
      /* errors shown via toast in Dashboard */
    } finally {
      setConfirmando(false);
    }
  }

  async function submit() {
    setErro("");
    if (!estaDentroJanelaSolicitacaoAgendamento(ctx.windowType, new Date(), ctx.specKey)) {
      setErro(msgForaJanelaSolicitacaoAgendamento(ctx.windowType, ctx.specKey));
      return;
    }
    if (ctx.windowType === "prev" && ctx.podeAgendarPrev === false) {
      setErro(
        msgForaDiaAgendamentoPrev(
          { key: ctx.specKey, agendaQualquerDiaUtil: ctx.agendaQualquerDiaUtil },
          profissionalConfigPorSpec
        )
      );
      return;
    }
    if (encaixeParaDirecao) {
      if (!direcaoEncaixeWhatsappOk) {
        setErro(
          "Nenhum WhatsApp da direção cadastrado para encaixes. Peça à recepção para cadastrar em Config. → Usuários."
        );
        return;
      }
    } else if (!recepcaoWhatsappOk) {
      setErro(
        "Nenhum WhatsApp da recepção disponível. Peça para cadastrar o número em Config. → Usuários (um recepcionista precisa ter feito login ao menos uma vez com WhatsApp cadastrado)."
      );
      return;
    }

    if (isEncaminhamentoObrigatorio) {
      if (!paciente.trim()) {
        setErro("Informe o nome do paciente.");
        return;
      }
      if (!isCpfOuCartaoSusCompleto(documentoPaciente)) {
        setErro(ERRO_CPF_SUS_INCOMPLETO);
        return;
      }
      if (telefone.replace(/\D/g, "").length < 10) {
        setErro("Informe um telefone válido.");
        return;
      }
      if (!encaminhamentoFile) {
        setErro("Anexe a foto do encaminhamento.");
        return;
      }
      const waTabFisio = window.open("about:blank", "_blank");
      if (!waTabFisio) {
        setErro(
          "Permita pop-ups para este site para abrir o WhatsApp após enviar a imagem (o navegador bloqueia após o upload)."
        );
        return;
      }
      setEnviando(true);
      let sucesso = false;
      try {
        await onSubmit({
          ...ctx,
          solicitacaoEncaminhamentoObrigatorio: true,
          paciente: paciente.trim(),
          documentoPaciente: formatarCpfOuSusDigitos(digitosCpfOuSus(documentoPaciente)),
          telefonePaciente: telefone,
          nomeAgenteSaude:
            typeof ctx.agenteNomeDefault === "string" ? ctx.agenteNomeDefault.trim() : "",
          observacaoExtra: observacao.trim(),
          docFile: encaminhamentoFile,
          whatsappBlankWindow: waTabFisio,
        });
        sucesso = true;
      } catch (err) {
        try {
          if (waTabFisio && !waTabFisio.closed) waTabFisio.close();
        } catch {
          /* ignore */
        }
        setErro(err?.message || "Não foi possível enviar. Tente de novo.");
      } finally {
        setEnviando(false);
      }
      if (sucesso) setFase("confirmacao");
      return;
    }

    if (isColetaExamesRotina) {
      if (!cartaoSusFile) {
        if (!paciente.trim()) {
          setErro("Informe o nome do paciente ou selecione a foto do cartão do SUS.");
          return;
        }
        if (!dataNascimento) {
          setErro("Informe a data de nascimento ou selecione a foto do cartão do SUS.");
          return;
        }
        if (dataNascimento > maxDataNascimento) {
          setErro("A data de nascimento não pode ser posterior à data de hoje.");
          return;
        }
        if (!isCpfOuCartaoSusCompleto(documentoPaciente)) {
          setErro(`${ERRO_CPF_SUS_INCOMPLETO} Ou selecione a foto do cartão do SUS.`);
          return;
        }
      }
      if (!pedidoExameFiles.length) {
        setErro("Anexe ao menos uma foto do pedido de exame.");
        return;
      }
      const waTabColeta = window.open("about:blank", "_blank");
      if (!waTabColeta) {
        setErro(
          "Permita pop-ups para este site para abrir o WhatsApp após enviar as imagens (o navegador bloqueia após o upload)."
        );
        return;
      }
      setEnviando(true);
      let sucesso = false;
      try {
        await onSubmit({
          ...ctx,
          paciente: paciente.trim(),
          dataNascimentoPaciente: cartaoSusFile ? "" : dataNascimento,
          documentoPaciente: cartaoSusFile
            ? ""
            : formatarCpfOuSusDigitos(digitosCpfOuSus(documentoPaciente)),
          observacaoExtra: observacao.trim(),
          docFiles: pedidoExameFiles,
          cartaoSusFile,
          whatsappBlankWindow: waTabColeta,
        });
        sucesso = true;
      } catch (err) {
        try {
          if (waTabColeta && !waTabColeta.closed) waTabColeta.close();
        } catch {
          /* ignore */
        }
        setErro(err?.message || "Não foi possível enviar. Tente de novo.");
      } finally {
        setEnviando(false);
      }
      if (sucesso) setFase("confirmacao");
      return;
    }

    if (docFile) {
      if (dataNascimento && dataNascimento > maxDataNascimento) {
        setErro("A data de nascimento não pode ser posterior à data de hoje.");
        return;
      }
      const waTabDoc = window.open("about:blank", "_blank");
      if (!waTabDoc) {
        setErro(
          "Permita pop-ups para este site para abrir o WhatsApp após enviar a imagem (o navegador bloqueia após o upload)."
        );
        return;
      }
      setEnviando(true);
      let sucesso = false;
      try {
        await onSubmit({
          ...ctx,
          paciente: paciente.trim(),
          dataNascimentoPaciente: dataNascimento || "",
          documentoPaciente: formatarCpfOuSusDigitos(digitosCpfOuSus(documentoPaciente)),
          observacaoExtra: observacao.trim(),
          docFile,
          whatsappBlankWindow: waTabDoc,
        });
        sucesso = true;
      } catch (err) {
        try {
          if (waTabDoc && !waTabDoc.closed) waTabDoc.close();
        } catch {
          /* ignore */
        }
        setErro(err?.message || "Não foi possível enviar. Tente de novo.");
      } finally {
        setEnviando(false);
      }
      if (sucesso) setFase("confirmacao");
      return;
    }

    if (!paciente.trim()) {
      setErro("Informe o nome do paciente.");
      return;
    }
    if (!dataNascimento) {
      setErro("Informe a data de nascimento.");
      return;
    }
    if (dataNascimento > maxDataNascimento) {
      setErro("A data de nascimento não pode ser posterior à data de hoje.");
      return;
    }
    if (!isCpfOuCartaoSusCompleto(documentoPaciente)) {
      setErro(ERRO_CPF_SUS_INCOMPLETO);
      return;
    }

    setEnviando(true);
    let sucesso = false;
    try {
      await onSubmit({
        ...ctx,
        paciente: paciente.trim(),
        dataNascimentoPaciente: dataNascimento,
        documentoPaciente: formatarCpfOuSusDigitos(digitosCpfOuSus(documentoPaciente)),
        observacaoExtra: observacao.trim(),
        docFile: null,
      });
      sucesso = true;
    } catch (err) {
      setErro(err?.message || "Não foi possível enviar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
    if (sucesso) setFase("confirmacao");
  }

  if (fase === "confirmacao") {
    return (
      <div style={S.overlay}>
        <div style={S.modal}>
          <div style={S.header}>
            {ctx.specKey && (
              <div
                style={{
                  ...S.av,
                  background: (SPEC_META[ctx.specKey] || {}).bg || "#F1F5F9",
                  color: (SPEC_META[ctx.specKey] || {}).tc || "#475569",
                }}
              >
                {(SPEC_META[ctx.specKey] || {}).av || "?"}
              </div>
            )}
            <div>
              <p style={S.title}>Confirmação de envio</p>
              <p style={S.sub}>{profNames[ctx.specKey] || ctx.specKey}</p>
            </div>
          </div>

          <div style={S.confirmacaoBox}>
            <p style={S.confirmacaoTitulo}>
              Você enviou a mensagem para a {textoDestinoWa}?
            </p>
            <p style={S.confirmacaoHint}>
              Se sim, a vaga será preenchida automaticamente no sistema.
              Se não enviou, a vaga ficará disponível.
            </p>
          </div>

          <div style={S.actions}>
            <button
              style={S.btnCancel}
              onClick={onCancelarAposEnvio}
              disabled={confirmando}
            >
              Não enviei
            </button>
            <button
              style={{ ...S.btnOk, opacity: confirmando ? 0.7 : 1 }}
              onClick={confirmar}
              disabled={confirmando}
            >
              {confirmando ? "Preenchendo…" : "Sim, enviei"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && !enviando && onClose()}>
      <div style={S.modal}>
        <div style={S.header}>
          {ctx.specKey && (
            <div
              style={{
                ...S.av,
                background: meta.bg || "#F1F5F9",
                color: meta.tc || "#475569",
              }}
            >
              {meta.av || "?"}
            </div>
          )}
          <div>
            <p style={S.title}>
              {isEncaminhamentoObrigatorio
                ? "Solicitar agendamento — fisioterapia"
                : isColetaExamesRotina
                  ? "Solicitar agendamento — coleta de exames"
                : isSomenteEncaixe && rotuloModalEncaixe
                  ? `Solicitar encaixe — ${rotuloModalEncaixe}`
                  : isSomenteEncaixe
                    ? "Solicitar encaixe"
                    : "Solicitar agendamento"}
            </p>
            <p style={S.sub}>
              {nome}
              {ctx.sessLabel ? (
                <>
                  {" · "}
                  <span style={S.subSessaoWrap}>
                    <SessaoLabelComDestaqueTurno label={ctx.sessLabel} />
                  </span>
                </>
              ) : null}
              {ctx.atendimentoDate
                ? ` · Atend.: ${new Date(ctx.atendimentoDate + "T12:00:00").toLocaleDateString("pt-BR")}`
                : ""}
            </p>
          </div>
        </div>

        <div style={S.resumo}>
          <p style={S.resumoTitle}>Dados da vaga</p>
          <p style={S.resumoLine}>
            <strong>Profissional:</strong> {nome}
            {meta.role ? ` · ${meta.role}` : ""}
          </p>
          <p style={S.resumoLine}>
            <strong>Data do atendimento:</strong> {dataAtendimentoFmt || "—"}
          </p>
          <p style={S.resumoLine}>
            <strong>Turno (horário):</strong>{" "}
            <span style={S.resumoTurnoWrap}>
              <SessaoLabelComDestaqueTurno label={ctx.sessLabel} />
            </span>
          </p>
          <p style={S.resumoHint}>
            {isEncaminhamentoObrigatorio
              ? `Preencha os dados do paciente e anexe a foto do encaminhamento. O nome do agente de saúde (seu cadastro) entra na mensagem do WhatsApp. Ao enviar, abre o WhatsApp da ${textoDestinoWa} com o texto pronto.`
              : isColetaExamesRotina
                ? `Preencha os dados do paciente nos campos de texto ou selecione a foto do cartão do SUS (opcional). A foto do pedido de exame é obrigatória (até ${MAX_FOTOS_PEDIDO_EXAME} fotos). Ao enviar, abre o WhatsApp da ${textoDestinoWa} com a mensagem pronta.`
              : isSomenteEncaixe
                ? `${fraseVagasEsgotadasEncaixe({
                    livres: ctx.livresEncaixe ?? 0,
                    medicoTipo: ctx.medicoTipo,
                    pccuOnly: ctx.pccuOnly,
                    specKey: ctx.specKey,
                    sessLabel: ctx.sessLabel,
                  })} Os dados abaixo são do paciente. Ao enviar, abre o WhatsApp da ${textoDestinoWa} com a mensagem pronta.`
                : `Os dados abaixo são do paciente. Ao enviar, abre o WhatsApp da ${textoDestinoWa} com a mensagem pronta para você revisar e enviar.`}
          </p>
        </div>

        <div style={S.body}>
          {isEncaminhamentoObrigatorio ? (
            <>
              <p style={S.fisioTituloCampos}>Preencha todos os campos (obrigatórios)</p>
              <Field label="1. Nome do paciente">
                <input
                  style={S.input}
                  value={paciente}
                  onChange={(e) => setPaciente(e.target.value)}
                  placeholder="Nome completo do paciente"
                  autoFocus
                />
              </Field>
              <Field label={`2. ${LABEL_CPF_SUS}`}>
                <input
                  style={S.input}
                  value={documentoPaciente}
                  onChange={(e) => handleDocumentoCpfSus(e.target.value)}
                  placeholder={PLACEHOLDER_CPF_SUS}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </Field>
              <Field label="3. Número de telefone">
                <input
                  style={S.input}
                  value={telefone}
                  onChange={(e) => handleTel(e.target.value)}
                  placeholder="(99) 99999-9999"
                  inputMode="numeric"
                />
              </Field>
              <div style={{ marginBottom: 12 }}>
                <Field label="4. Foto do encaminhamento (obrigatória)">
                  <input
                    type="file"
                    accept="image/*"
                    id="encaminhamento-input"
                    style={{ display: "none" }}
                    onChange={onPickEncaminhamento}
                  />
                  <label htmlFor="encaminhamento-input" style={S.btnFile}>
                    Tirar ou escolher foto do encaminhamento
                  </label>
                  {encaminhamentoFile && (
                    <button type="button" style={S.btnClearPhoto} onClick={limparEncaminhamento}>
                      Remover foto
                    </button>
                  )}
                </Field>
                {encaminhamentoPreview && (
                  <img
                    src={encaminhamentoPreview}
                    alt="Pré-visualização do encaminhamento"
                    style={S.preview}
                  />
                )}
              </div>
            </>
          ) : isColetaExamesRotina ? (
            <>
              <p style={S.fisioTituloCampos}>
                {cartaoSusFile
                  ? "Dados do paciente via foto do cartão do SUS"
                  : "Dados do paciente (preencha os campos ou envie foto do cartão do SUS)"}
              </p>
              <Field label={cartaoSusFile ? "Nome do paciente (opcional)" : "Nome do paciente"}>
                <input
                  style={S.input}
                  value={paciente}
                  onChange={(e) => setPaciente(e.target.value)}
                  placeholder="Nome completo do paciente"
                  autoFocus
                />
              </Field>
              <Field label="Data de nascimento">
                <div style={S.dataNascimentoWrap}>
                  <input
                    style={S.input}
                    type="text"
                    value={dataNascimentoInput}
                    onChange={(e) => handleDataNascimentoDigitada(e.target.value)}
                    placeholder="DD/MM/AAAA"
                    inputMode="numeric"
                    autoComplete="bday"
                    disabled={Boolean(cartaoSusFile)}
                  />
                  <button
                    type="button"
                    style={S.btnPicker}
                    onClick={abrirSeletorNascimento}
                    disabled={Boolean(cartaoSusFile)}
                  >
                    Selecionar
                  </button>
                  <input
                    ref={nascimentoPickerRef}
                    style={S.hiddenDateInput}
                    type="date"
                    value={dataNascimento}
                    max={maxDataNascimento}
                    onChange={(e) => {
                      const v = e.target.value;
                      const ajustada = v && v > maxDataNascimento ? maxDataNascimento : v;
                      setDataNascimento(ajustada);
                      setDataNascimentoInput(formatarDataIsoParaBr(ajustada));
                    }}
                    tabIndex={-1}
                    aria-hidden="true"
                    disabled={Boolean(cartaoSusFile)}
                  />
                </div>
              </Field>
              <Field label={LABEL_CPF_SUS}>
                <input
                  style={S.input}
                  value={documentoPaciente}
                  onChange={(e) => handleDocumentoCpfSus(e.target.value)}
                  placeholder={PLACEHOLDER_CPF_SUS}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={Boolean(cartaoSusFile)}
                />
              </Field>

              <div style={S.sep}>
                <span style={S.sepText}>ou foto do cartão do SUS</span>
              </div>
              <div style={{ marginBottom: 12 }}>
                <input
                  type="file"
                  accept="image/*"
                  id="cartao-sus-input"
                  style={{ display: "none" }}
                  onChange={onPickCartaoSus}
                />
                <label htmlFor="cartao-sus-input" style={S.btnFile}>
                  Tirar ou escolher foto do cartão do SUS
                </label>
                {cartaoSusFile && (
                  <button type="button" style={S.btnClearPhoto} onClick={limparCartaoSus}>
                    Remover foto
                  </button>
                )}
                <p style={S.hintFoto}>
                  Com a foto do cartão selecionada, os campos acima ficam opcionais (bloqueados).
                </p>
                {cartaoSusPreview && (
                  <img
                    src={cartaoSusPreview}
                    alt="Pré-visualização do cartão do SUS"
                    style={S.preview}
                  />
                )}
              </div>

              <div style={S.sep}>
                <span style={S.sepText}>pedido de exame (obrigatório)</span>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Field
                  label={`Fotos do pedido de exame (até ${MAX_FOTOS_PEDIDO_EXAME})`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    id="pedido-exame-input"
                    style={{ display: "none" }}
                    onChange={onPickPedidoExame}
                  />
                  <label htmlFor="pedido-exame-input" style={S.btnFile}>
                    Tirar ou escolher fotos do pedido
                  </label>
                  {pedidoExameFiles.length > 0 && (
                    <button type="button" style={S.btnClearPhoto} onClick={limparPedidosExame}>
                      Remover todas
                    </button>
                  )}
                  {pedidoExameFiles.length > 0 && (
                    <p style={S.hintFoto}>
                      {pedidoExameFiles.length}{" "}
                      {pedidoExameFiles.length === 1 ? "foto anexada" : "fotos anexadas"}. Você pode
                      adicionar mais imagens antes de enviar.
                    </p>
                  )}
                </Field>
                {pedidoExamePreviews.length > 0 && (
                  <div style={S.previewGrid}>
                    {pedidoExamePreviews.map((src, i) => (
                      <div key={`${src}-${i}`} style={S.previewItem}>
                        <img
                          src={src}
                          alt={`Pré-visualização do pedido ${i + 1}`}
                          style={S.previewThumb}
                        />
                        <button
                          type="button"
                          style={S.btnRemovePreview}
                          onClick={() => removerPedidoExame(i)}
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Field label={docFile ? "Nome do paciente (opcional)" : "Nome completo do paciente"}>
                <input
                  style={S.input}
                  value={paciente}
                  onChange={(e) => setPaciente(e.target.value)}
                  placeholder="Ex.: João da Silva"
                  autoFocus
                />
              </Field>
              <Field label="Data de nascimento">
                <div style={S.dataNascimentoWrap}>
                  <input
                    style={S.input}
                    type="text"
                    value={dataNascimentoInput}
                    onChange={(e) => handleDataNascimentoDigitada(e.target.value)}
                    placeholder="DD/MM/AAAA"
                    inputMode="numeric"
                    autoComplete="bday"
                    disabled={Boolean(docFile)}
                  />
                  <button
                    type="button"
                    style={S.btnPicker}
                    onClick={abrirSeletorNascimento}
                    disabled={Boolean(docFile)}
                  >
                    Selecionar
                  </button>
                  <input
                    ref={nascimentoPickerRef}
                    style={S.hiddenDateInput}
                    type="date"
                    value={dataNascimento}
                    max={maxDataNascimento}
                    onChange={(e) => {
                      const v = e.target.value;
                      const ajustada = v && v > maxDataNascimento ? maxDataNascimento : v;
                      setDataNascimento(ajustada);
                      setDataNascimentoInput(formatarDataIsoParaBr(ajustada));
                    }}
                    tabIndex={-1}
                    aria-hidden="true"
                    disabled={Boolean(docFile)}
                  />
                </div>
              </Field>
              <Field label={LABEL_CPF_SUS}>
                <input
                  style={S.input}
                  value={documentoPaciente}
                  onChange={(e) => handleDocumentoCpfSus(e.target.value)}
                  placeholder={PLACEHOLDER_CPF_SUS}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={Boolean(docFile)}
                />
              </Field>

              <div style={S.sep}>
                <span style={S.sepText}>ou envie foto do documento</span>
              </div>
              <div style={{ marginBottom: 12 }}>
                <input
                  type="file"
                  accept="image/*"
                  id="doc-paciente-input"
                  style={{ display: "none" }}
                  onChange={onPickDoc}
                />
                <label htmlFor="doc-paciente-input" style={S.btnFile}>
                  Escolher imagem da galeria
                </label>
                {docFile && (
                  <button type="button" style={S.btnClearPhoto} onClick={limparFoto}>
                    Remover foto
                  </button>
                )}
                <p style={S.hintFoto}>
                  Com foto selecionada, os campos acima ficam opcionais (bloqueados); a recepção verá o
                  link da imagem no WhatsApp.
                </p>
                {docPreview && (
                  <img src={docPreview} alt="Pré-visualização do documento" style={S.preview} />
                )}
              </div>
            </>
          )}
          <Field label="Observação (opcional)">
            <textarea
              style={S.textarea}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Informe observações extras para a recepção, se necessário"
              rows={3}
              maxLength={800}
            />
          </Field>
        </div>

        {(erro || foraJanelaSolicitacao || foraDiaAgendamento) && (
          <p style={S.erro}>
            {erro || msgForaDia || msgForaJanelaSolicitacaoAgendamento(ctx.windowType, ctx.specKey)}
          </p>
        )}

        <div style={S.actions}>
          <button style={S.btnCancel} onClick={onClose} disabled={enviando}>
            Cancelar
          </button>
          <button
            style={S.btnOk}
            onClick={submit}
            disabled={enviando || foraJanelaSolicitacao || foraDiaAgendamento}
          >
            {enviando ? "Enviando…" : "Enviar solicitação"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

const S = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 16,
  },
  modal: {
    background: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
    maxHeight: "90vh",
    overflowY: "auto",
  },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  resumo: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 16,
  },
  resumoTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: "0 0 8px",
  },
  resumoLine: {
    fontSize: 13,
    color: "#334155",
    margin: "0 0 6px",
    lineHeight: 1.45,
  },
  resumoHint: {
    fontSize: 11,
    color: "#64748B",
    margin: "10px 0 0",
    lineHeight: 1.4,
    borderTop: "1px solid #E2E8F0",
    paddingTop: 10,
  },
  av: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 600,
    flexShrink: 0,
  },
  title: { fontSize: 15, fontWeight: 600, color: "#0F172A", margin: 0 },
  sub: { fontSize: 12, color: "#64748B", margin: 0 },
  /** Alinha pill de turno com o subtítulo do cabeçalho. */
  subSessaoWrap: {
    display: "inline-flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    verticalAlign: "middle",
  },
  resumoTurnoWrap: {
    display: "inline-flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    verticalAlign: "middle",
  },
  body: {},
  fisioTituloCampos: {
    fontSize: 13,
    fontWeight: 600,
    color: "#0F172A",
    margin: "0 0 14px",
    paddingBottom: 10,
    borderBottom: "1px solid #E2E8F0",
  },
  input: {
    padding: "9px 11px",
    fontSize: 14,
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    background: "#fff",
    color: "#0F172A",
    outline: "none",
    width: "100%",
  },
  dataNascimentoWrap: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  btnPicker: {
    padding: "9px 11px",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid #C7D2FE",
    borderRadius: 8,
    background: "#EEF2FF",
    color: "#3730A3",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  hiddenDateInput: {
    position: "absolute",
    opacity: 0,
    pointerEvents: "none",
    width: 1,
    height: 1,
  },
  textarea: {
    padding: "9px 11px",
    fontSize: 14,
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    background: "#fff",
    color: "#0F172A",
    outline: "none",
    width: "100%",
    resize: "vertical",
    minHeight: 72,
    fontFamily: "inherit",
    lineHeight: 1.45,
  },
  sep: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "4px 0 10px",
    color: "#94A3B8",
  },
  sepText: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" },
  btnFile: {
    display: "inline-block",
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    background: "#EEF2FF",
    color: "#3730A3",
    border: "1px solid #C7D2FE",
    cursor: "pointer",
    marginRight: 8,
  },
  btnClearPhoto: {
    padding: "8px 12px",
    fontSize: 12,
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    background: "#fff",
    color: "#64748B",
    cursor: "pointer",
  },
  hintFoto: { fontSize: 11, color: "#94A3B8", margin: "8px 0 0", lineHeight: 1.4 },
  preview: {
    marginTop: 10,
    maxWidth: "100%",
    maxHeight: 160,
    borderRadius: 8,
    border: "1px solid #E2E8F0",
    objectFit: "contain",
  },
  previewGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 10,
  },
  previewItem: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  previewThumb: {
    maxWidth: "100%",
    maxHeight: 140,
    borderRadius: 8,
    border: "1px solid #E2E8F0",
    objectFit: "contain",
  },
  btnRemovePreview: {
    alignSelf: "flex-start",
    padding: "6px 10px",
    fontSize: 11,
    border: "1px solid #FECACA",
    borderRadius: 6,
    background: "#FEF2F2",
    color: "#B91C1C",
    cursor: "pointer",
  },
  erro: {
    fontSize: 12,
    color: "#DC2626",
    background: "#FEF2F2",
    padding: "6px 10px",
    borderRadius: 6,
    marginBottom: 12,
  },
  confirmacaoBox: {
    background: "#F0FDF4",
    border: "1px solid #BBF7D0",
    borderRadius: 10,
    padding: "16px 14px",
    marginBottom: 20,
  },
  confirmacaoTitulo: {
    fontSize: 15,
    fontWeight: 600,
    color: "#15803D",
    margin: "0 0 8px",
  },
  confirmacaoHint: {
    fontSize: 13,
    color: "#166534",
    margin: 0,
    lineHeight: 1.5,
  },
  actions: { display: "flex", gap: 10 },
  btnCancel: {
    flex: 1,
    padding: 10,
    fontSize: 13,
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    cursor: "pointer",
    background: "transparent",
    color: "#64748B",
  },
  btnOk: {
    flex: 1,
    padding: 10,
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#0C447C",
    color: "#fff",
  },
};

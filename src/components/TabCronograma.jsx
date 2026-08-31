import { useEffect, useMemo, useState } from "react";
import { updateCronogramaUbs } from "../services/db";
import {
  CRONOGRAMA_CATEGORIAS,
  CRONOGRAMA_TURNOS,
  CRONOGRAMA_TURNO_LABEL,
  DAY_LABEL,
  ORDEM_DIA_SEMANA_GRADE,
  chaveProfissionalCronograma,
  cronogramaTemItens,
  cronogramaUbsIguais,
  filtrarMapaCronogramaPorProfissional,
  itensCronogramaPorDiaTurno,
  labelCategoria,
  labelTipoAtendimento,
  normalizeCronogramaUbs,
  novoItemCronogramaRascunho,
  prepararItemCronogramaParaSalvar,
  profissionaisUnicosNoCronograma,
  tiposAtendimentoParaCategoria,
  validarItemCronogramaRascunho,
} from "../services/cronogramaUbs";
import {
  filtrarSpecKeysAtivos,
  listaSpecKeysCustom,
  specKeyEstaDesativado,
  getSpecMetaForKey,
} from "../services/scheduleConfig";

const DAY_LABEL_CURTO = {
  segunda: "Seg",
  terca: "Ter",
  quarta: "Qua",
  quinta: "Qui",
  sexta: "Sex",
};

export default function TabCronograma({
  cronogramaUbs,
  specKeysDesativados = [],
  profNames = {},
  profissionaisMap = {},
  profissionalConfigPorSpec = {},
  podeEditar,
  showToast,
}) {
  const publicado = useMemo(() => normalizeCronogramaUbs(cronogramaUbs), [cronogramaUbs]);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(publicado);
  const [form, setForm] = useState(() => novoItemCronogramaRascunho());
  const [itemEditandoId, setItemEditandoId] = useState(null);
  const [profFiltro, setProfFiltro] = useState(null);
  const [diaFiltro, setDiaFiltro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!editando) {
      setRascunho(publicado);
      setItemEditandoId(null);
      setProfFiltro(null);
      setDiaFiltro(null);
    }
  }, [publicado, editando]);

  const categoriasAtivas = useMemo(() => {
    const keys = filtrarSpecKeysAtivos(
      CRONOGRAMA_CATEGORIAS.map((c) => c.key),
      specKeysDesativados
    );
    const fixas = CRONOGRAMA_CATEGORIAS.filter((c) => keys.includes(c.key));
    // Profissionais cadastrados em Config. → "Novo profissional" (specKey `custom_*`) também
    // entram como categoria aqui — sem isso, eles nunca aparecem para escolha no cronograma.
    const customKeys = listaSpecKeysCustom(profissionaisMap, profissionalConfigPorSpec).filter(
      (k) => !specKeyEstaDesativado(k, specKeysDesativados)
    );
    const custom = customKeys.map((key) => ({
      key,
      label: getSpecMetaForKey(key, { profissionalConfigPorSpec }).role,
    }));
    return [...fixas, ...custom];
  }, [specKeysDesativados, profissionaisMap, profissionalConfigPorSpec]);

  // Rótulo só com a função — usado no badge do item e no filtro "Todos os profissionais",
  // onde o nome já aparece do lado (não repetir "Fulana — Fulana — Clínico Geral").
  const categoriaLabels = useMemo(() => {
    const map = {};
    for (const c of categoriasAtivas) map[c.key] = c.label;
    return map;
  }, [categoriasAtivas]);

  const resolverLabelCategoria = (categoria) => categoriaLabels[categoria] || labelCategoria(categoria);

  // `categoriaLabels` já guarda a função (role) de cada categoria — reaproveita como dica pra
  // achar os tipos de atendimento certos quando a categoria é um profissional customizado
  // (ex.: "Clínico Geral" cadastrado avulso ganha os mesmos tipos do médico fixo).
  const tiposDaCategoria = (categoria) => tiposAtendimentoParaCategoria(categoria, categoriaLabels[categoria]);

  // O formulário de novo atendimento começa com a categoria "medico" (padrão em código). Se esse
  // profissional (ou o que estiver selecionado) for excluído/desativado enquanto o formulário
  // não está em edição de um item existente, troca sozinho pela primeira categoria ativa — sem
  // isso, clicar em "Adicionar" sem mexer no campo Categoria criava um item "fantasma" preso a um
  // profissional que não existe mais (foi o que gerou o "Dr. Clínico" órfão no cronograma).
  useEffect(() => {
    if (itemEditandoId) return;
    if (categoriasAtivas.length === 0) return;
    if (categoriasAtivas.some((c) => c.key === form.categoria)) return;
    const categoria = categoriasAtivas[0].key;
    const tipos = tiposAtendimentoParaCategoria(categoria, categoriaLabels[categoria]);
    setForm({
      ...novoItemCronogramaRascunho(categoria),
      nome: profNames[categoria] || "",
      tipos: tipos[0] ? [tipos[0].key] : [],
    });
  }, [categoriasAtivas, categoriaLabels, form.categoria, itemEditandoId, profNames]);

  // Rótulo com nome + função — só para o <select> de Categoria no formulário, que é o próprio
  // seletor de profissional: a função sozinha ("Clínico Geral") não diferencia quem é quem
  // quando há mais de um profissional cadastrado com a mesma função.
  const categoriasFormOpcoes = useMemo(
    () =>
      categoriasAtivas.map((c) => {
        const nome = profNames[c.key];
        return { key: c.key, label: nome ? `${nome} — ${c.label}` : c.label };
      }),
    [categoriasAtivas, profNames]
  );

  const mapaPublicado = useMemo(() => itensCronogramaPorDiaTurno(publicado), [publicado]);
  const mapaRascunho = useMemo(() => itensCronogramaPorDiaTurno(rascunho), [rascunho]);
  const profissionaisLista = useMemo(
    () => profissionaisUnicosNoCronograma(editando ? rascunho : publicado),
    [editando, rascunho, publicado]
  );
  const mapaExibicao = useMemo(() => {
    const base = editando ? mapaRascunho : mapaPublicado;
    return filtrarMapaCronogramaPorProfissional(base, profFiltro);
  }, [editando, mapaRascunho, mapaPublicado, profFiltro]);

  const diasExibicao = useMemo(
    () => (diaFiltro ? [diaFiltro] : ORDEM_DIA_SEMANA_GRADE),
    [diaFiltro]
  );

  const temFiltroAtivo = profFiltro !== null || diaFiltro !== null;
  const temDados = editando || cronogramaTemItens(publicado);
  const tiposForm = tiposDaCategoria(form.categoria);
  const rascunhoIgualPublicado = cronogramaUbsIguais(rascunho, publicado);

  const gradeVazia = useMemo(() => {
    if (!temFiltroAtivo || editando) return false;
    return diasExibicao.every((dia) =>
      CRONOGRAMA_TURNOS.every((t) => (mapaExibicao[dia]?.[t] || []).length === 0)
    );
  }, [temFiltroAtivo, editando, diasExibicao, mapaExibicao]);

  function limparFormulario(categoria = form.categoria) {
    const base = novoItemCronogramaRascunho(categoria);
    const tipos = tiposDaCategoria(categoria);
    setForm({
      ...base,
      nome: profNames[categoria] || base.nome,
      tipos: tipos[0] ? [tipos[0].key] : [],
    });
    setItemEditandoId(null);
  }

  function iniciarEdicao() {
    setRascunho(publicado);
    limparFormulario();
    setProfFiltro(null);
    setEditando(true);
  }

  function cancelar() {
    setRascunho(publicado);
    limparFormulario();
    setProfFiltro(null);
    setDiaFiltro(null);
    setEditando(false);
  }

  function aoSelecionarProfissional(chave) {
    if (!chave) {
      setProfFiltro(null);
      return;
    }
    const prof = profissionaisLista.find((p) => p.chave === chave);
    if (!prof) return;
    setProfFiltro(prof);
    if (editando && !itemEditandoId) {
      setForm((prev) => ({
        ...novoItemCronogramaRascunho(prof.categoria),
        nome: prof.nome,
        categoria: prof.categoria,
        dia: diaFiltro || prev.dia,
        tipos: tiposDaCategoria(prof.categoria)[0]
          ? [tiposDaCategoria(prof.categoria)[0].key]
          : [],
      }));
    }
  }

  function aoSelecionarDia(dia) {
    setDiaFiltro(dia);
    if (editando && !itemEditandoId && dia) {
      setForm((prev) => ({ ...prev, dia }));
    }
  }

  function iniciarEdicaoItem(item) {
    setForm({
      id: item.id,
      categoria: item.categoria,
      nome: item.nome,
      dia: item.dia,
      turno: item.turno,
      tipos: [...item.tipos],
    });
    setItemEditandoId(item.id);
    setProfFiltro({
      categoria: item.categoria,
      nome: item.nome,
      chave: chaveProfissionalCronograma(item.categoria, item.nome),
    });
  }

  async function salvar() {
    if (!podeEditar || salvando) return;
    setSalvando(true);
    try {
      await updateCronogramaUbs(rascunho);
      showToast("Cronograma atualizado.", "success");
      setEditando(false);
    } catch {
      showToast("Não foi possível salvar o cronograma.", "danger");
    } finally {
      setSalvando(false);
    }
  }

  function aoMudarCategoria(categoria) {
    const tipos = tiposDaCategoria(categoria);
    setForm((prev) => ({
      ...prev,
      categoria,
      nome: (profNames[categoria] || prev.nome || "").trim(),
      tipos: tipos[0] ? [tipos[0].key] : [],
    }));
  }

  function alternarTipo(tipoKey) {
    setForm((prev) => {
      const ativos = new Set(prev.tipos);
      if (ativos.has(tipoKey)) ativos.delete(tipoKey);
      else ativos.add(tipoKey);
      return { ...prev, tipos: [...ativos] };
    });
  }

  function salvarItemFormulario() {
    const erro = validarItemCronogramaRascunho(form);
    if (erro) {
      showToast(erro, "danger");
      return;
    }
    const eraEdicao = !!itemEditandoId;
    const id =
      itemEditandoId ||
      `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const item = prepararItemCronogramaParaSalvar(form, id);
    if (!item) return;
    setRascunho((prev) => {
      const existe = prev.itens.some((i) => i.id === item.id);
      const itens = existe
        ? prev.itens.map((i) => (i.id === item.id ? item : i))
        : [...prev.itens, item];
      return normalizeCronogramaUbs({ ...prev, itens });
    });
    const cat = form.categoria;
    limparFormulario(cat);
    const novoForm = profFiltro
      ? {
          ...novoItemCronogramaRascunho(profFiltro.categoria),
          categoria: profFiltro.categoria,
          nome: profFiltro.nome,
          dia: diaFiltro || novoItemCronogramaRascunho(profFiltro.categoria).dia,
          tipos: tiposDaCategoria(profFiltro.categoria)[0]
            ? [tiposDaCategoria(profFiltro.categoria)[0].key]
            : [],
        }
      : diaFiltro
      ? { ...novoItemCronogramaRascunho(cat), dia: diaFiltro }
      : null;
    if (novoForm) setForm(novoForm);
    showToast(eraEdicao ? "Atendimento atualizado." : "Atendimento adicionado.", "success");
  }

  function removerItem(id) {
    setRascunho((prev) =>
      normalizeCronogramaUbs({ ...prev, itens: prev.itens.filter((item) => item.id !== id) })
    );
    if (itemEditandoId === id) limparFormulario();
  }

  return (
    <div>
      {/* ── Header ── */}
      <div style={S.pageHeader}>
        <div style={S.pageHeaderRow}>
          <div style={S.pageHeaderIcon} aria-hidden>📅</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={S.pageHeaderTitle}>Cronograma semanal</h2>
            <p style={S.pageHeaderSub}>Atendimentos por dia e turno</p>
          </div>
          {podeEditar && !editando && (
            <button type="button" style={S.btnEditar} onClick={iniciarEdicao}>
              ✎ Editar
            </button>
          )}
        </div>
      </div>

      {temDados && (
        <div style={S.filtroBar}>
          <div style={S.filtroLinha}>
            <span style={S.filtroLabel}>Dia</span>
            <div style={S.diaChips}>
              <button
                type="button"
                style={{ ...S.diaChip, ...(diaFiltro === null ? S.diaChipAtivo : {}) }}
                onClick={() => aoSelecionarDia(null)}
                disabled={salvando}
              >
                Todos
              </button>
              {ORDEM_DIA_SEMANA_GRADE.map((dia) => (
                <button
                  key={dia}
                  type="button"
                  style={{ ...S.diaChip, ...(diaFiltro === dia ? S.diaChipAtivo : {}) }}
                  onClick={() => aoSelecionarDia(diaFiltro === dia ? null : dia)}
                  disabled={salvando}
                >
                  {DAY_LABEL_CURTO[dia]}
                </button>
              ))}
            </div>
          </div>
          {profissionaisLista.length > 0 && (
            <div style={S.filtroLinha}>
              <span style={S.filtroLabel}>Profissional</span>
              <select
                style={S.inputFiltro}
                value={profFiltro?.chave || ""}
                onChange={(e) => aoSelecionarProfissional(e.target.value)}
                disabled={salvando}
              >
                <option value="">Todos os profissionais</option>
                {profissionaisLista.map((p) => (
                  <option key={p.chave} value={p.chave}>
                    {p.nome} — {resolverLabelCategoria(p.categoria)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {editando ? (
        <>
          <div style={S.card}>
            <p style={S.sectionTitle}>
              {itemEditandoId ? "Editar atendimento" : "Novo atendimento"}
            </p>
            <div style={S.formGrid}>
              <Field label="Categoria">
                <select
                  style={S.input}
                  value={form.categoria}
                  onChange={(e) => aoMudarCategoria(e.target.value)}
                  disabled={salvando}
                >
                  {categoriasFormOpcoes.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nome">
                <input
                  style={S.input}
                  value={form.nome}
                  onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex.: Dr. Saulo"
                  disabled={salvando}
                />
              </Field>
              <Field label="Dia">
                <select
                  style={S.input}
                  value={form.dia}
                  onChange={(e) => setForm((prev) => ({ ...prev, dia: e.target.value }))}
                  disabled={salvando}
                >
                  {ORDEM_DIA_SEMANA_GRADE.map((dia) => (
                    <option key={dia} value={dia}>
                      {DAY_LABEL[dia]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Turno">
                <select
                  style={S.input}
                  value={form.turno}
                  onChange={(e) => setForm((prev) => ({ ...prev, turno: e.target.value }))}
                  disabled={salvando}
                >
                  {CRONOGRAMA_TURNOS.map((turno) => (
                    <option key={turno} value={turno}>
                      {CRONOGRAMA_TURNO_LABEL[turno]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div style={S.tiposWrap}>
              <p style={S.label}>Tipos de atendimento</p>
              <div style={S.tiposLista}>
                {tiposForm.map((tipo) => (
                  <label key={tipo.key} style={S.tipoChk}>
                    <input
                      type="checkbox"
                      checked={form.tipos.includes(tipo.key)}
                      onChange={() => alternarTipo(tipo.key)}
                      disabled={salvando}
                    />
                    {tipo.label}
                  </label>
                ))}
              </div>
            </div>
            <div style={S.formAcoes}>
              <button
                type="button"
                style={S.btnAdicionar}
                disabled={salvando}
                onClick={salvarItemFormulario}
              >
                {itemEditandoId ? "Salvar alterações" : "Adicionar"}
              </button>
              {itemEditandoId && (
                <button
                  type="button"
                  style={S.btnCancelarForm}
                  disabled={salvando}
                  onClick={() => {
                    const cat = profFiltro?.categoria || form.categoria;
                    limparFormulario(cat);
                    const novoForm = profFiltro
                      ? {
                          ...novoItemCronogramaRascunho(cat),
                          categoria: profFiltro.categoria,
                          nome: profFiltro.nome,
                          dia: diaFiltro || novoItemCronogramaRascunho(cat).dia,
                          tipos: tiposDaCategoria(cat)[0]
                            ? [tiposDaCategoria(cat)[0].key]
                            : [],
                        }
                      : diaFiltro
                      ? { ...novoItemCronogramaRascunho(cat), dia: diaFiltro }
                      : null;
                    if (novoForm) setForm(novoForm);
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          <CronogramaGrade
            mapa={mapaExibicao}
            diasParaExibir={diasExibicao}
            editavel
            onRemover={removerItem}
            onEditar={iniciarEdicaoItem}
            itemEditandoId={itemEditandoId}
            categoriaLabels={categoriaLabels}
            profissionalConfigPorSpec={profissionalConfigPorSpec}
          />

          <div style={S.actions}>
            <button
              type="button"
              style={{ ...S.btnSalvar, opacity: salvando || rascunhoIgualPublicado ? 0.55 : 1 }}
              disabled={salvando || rascunhoIgualPublicado}
              onClick={salvar}
            >
              {salvando ? "Salvando…" : "Salvar cronograma"}
            </button>
            <button type="button" style={S.btnCancelar} disabled={salvando} onClick={cancelar}>
              Cancelar
            </button>
          </div>
        </>
      ) : cronogramaTemItens(publicado) ? (
        gradeVazia ? (
          <div style={S.vazio} role="status">
            <div style={S.vazioIcone} aria-hidden>🔍</div>
            <p style={S.vazioTitulo}>Nenhum resultado para este filtro</p>
            <p style={S.vazioSub}>Tente selecionar outro dia ou profissional.</p>
          </div>
        ) : (
          <CronogramaGrade
            mapa={mapaExibicao}
            diasParaExibir={diasExibicao}
            ocultarVazios={temFiltroAtivo}
            categoriaLabels={categoriaLabels}
            profissionalConfigPorSpec={profissionalConfigPorSpec}
          />
        )
      ) : (
        <div style={S.vazio} role="status">
          <div style={S.vazioIcone} aria-hidden>📅</div>
          <p style={S.vazioTitulo}>Nenhum cronograma publicado ainda</p>
          <p style={S.vazioSub}>
            {podeEditar
              ? "Use Editar para cadastrar profissionais, dias e tipos de atendimento."
              : "A recepção ou a direção ainda não publicaram o cronograma semanal."}
          </p>
        </div>
      )}
    </div>
  );
}

function CronogramaGrade({
  mapa,
  diasParaExibir = ORDEM_DIA_SEMANA_GRADE,
  editavel = false,
  onRemover,
  onEditar,
  itemEditandoId = null,
  ocultarVazios = false,
  categoriaLabels = {},
  profissionalConfigPorSpec = {},
}) {
  const soUmDia = diasParaExibir.length === 1;
  const [diasAbertos, setDiasAbertos] = useState(() => new Set());
  const toggleDia = (dia) =>
    setDiasAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(dia)) next.delete(dia);
      else next.add(dia);
      return next;
    });

  return (
    <div style={S.grade}>
      {diasParaExibir.map((dia) => {
        const diaTemItens = CRONOGRAMA_TURNOS.some((t) => (mapa[dia]?.[t] || []).length > 0);
        if (ocultarVazios && !diaTemItens && !editavel) return null;

        const turnosVisiveis = editavel
          ? CRONOGRAMA_TURNOS
          : CRONOGRAMA_TURNOS.filter(
              (t) => !ocultarVazios || (mapa[dia]?.[t] || []).length > 0
            );
        const totalDia = CRONOGRAMA_TURNOS.reduce(
          (acc, t) => acc + (mapa[dia]?.[t] || []).length,
          0
        );
        // Igual à aba Vagas: mostra só o dia da semana; clica pra abrir/fechar o conteúdo.
        // No modo edição ou com um único dia filtrado, fica sempre aberto.
        const podeColapsar = !editavel && !soUmDia;
        const aberto = !podeColapsar || diasAbertos.has(dia);

        return (
          <section key={dia} style={S.diaCard}>
            <div
              style={{ ...S.diaHeader, cursor: podeColapsar ? "pointer" : "default" }}
              onClick={podeColapsar ? () => toggleDia(dia) : undefined}
              role={podeColapsar ? "button" : undefined}
              tabIndex={podeColapsar ? 0 : undefined}
              aria-expanded={podeColapsar ? aberto : undefined}
              onKeyDown={
                podeColapsar
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleDia(dia);
                      }
                    }
                  : undefined
              }
            >
              <span style={S.diaBadge}>{DAY_LABEL_CURTO[dia]}</span>
              <h3 style={S.diaTitulo}>{DAY_LABEL[dia]}</h3>
              <span style={S.diaContagem}>
                {totalDia} {totalDia === 1 ? "atendimento" : "atendimentos"}
              </span>
              {podeColapsar && (
                <span
                  style={{
                    ...S.diaChevron,
                    transform: aberto ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                  aria-hidden
                >
                  ▾
                </span>
              )}
            </div>
            {aberto && (
            <div style={S.diaCorpo}>
              {turnosVisiveis.map((turno) => {
                const itens = mapa[dia]?.[turno] || [];
                const isManha = turno === "manha";
                return (
                  <div key={turno} style={S.turnoBloco}>
                    <div style={S.turnoHeader}>
                      <span style={isManha ? S.turnoBadgeManha : S.turnoBadgeTarde}>
                        <span aria-hidden>{isManha ? "☀️" : "🌤️"}</span>
                        {CRONOGRAMA_TURNO_LABEL[turno]}
                      </span>
                      <span style={S.turnoLinha} aria-hidden />
                    </div>
                    {itens.length === 0 ? (
                      <p style={S.turnoVazio}>Sem atendimentos neste turno.</p>
                    ) : (
                      <div style={S.itemGrid}>
                        {itens.map((item) => {
                          const meta = getSpecMetaForKey(item.categoria, {
                            profissionalConfigPorSpec,
                            nome: item.nome,
                          });
                          const emEdicao = itemEditandoId === item.id;
                          return (
                            <div
                              key={item.id}
                              style={{
                                ...S.item,
                                borderLeftColor: meta.tc || "#6366F1",
                                ...(emEdicao ? S.itemEditando : {}),
                              }}
                            >
                              <div style={S.itemTopo}>
                                <div
                                  style={{
                                    ...S.itemAvatar,
                                    background: meta.bg || "#EEF2FF",
                                    color: meta.tc || "#4338CA",
                                  }}
                                  aria-hidden
                                >
                                  {meta.av || "?"}
                                </div>
                                <div style={S.itemInfo}>
                                  <strong style={S.itemNome}>{item.nome}</strong>
                                  <span style={S.itemFuncao}>
                                    {categoriaLabels[item.categoria] || labelCategoria(item.categoria)}
                                  </span>
                                </div>
                                {editavel && (
                                  <div style={S.itemAcoes}>
                                    <button
                                      type="button"
                                      aria-label="Editar atendimento"
                                      style={{ ...S.btnIcone, ...(emEdicao ? S.btnIconeAtivo : {}) }}
                                      onClick={() => onEditar?.(item)}
                                    >
                                      ✎
                                    </button>
                                    <button
                                      type="button"
                                      aria-label="Remover atendimento"
                                      style={{ ...S.btnIcone, ...S.btnIconeRemover }}
                                      onClick={() => onRemover(item.id)}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                )}
                              </div>
                              {item.tipos.length > 0 && (
                                <div style={S.tags}>
                                  {item.tipos.map((tipo) => (
                                    <span key={tipo} style={S.tag}>
                                      {labelTipoAtendimento(item.categoria, tipo)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </section>
        );
      })}
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
  // ── Header ──
  pageHeader: {
    marginBottom: 16,
    padding: "14px 16px",
    background: "linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)",
    borderRadius: 14,
    border: "1px solid #C7D2FE",
  },
  pageHeaderRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  pageHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 19,
    flexShrink: 0,
    boxShadow: "0 4px 10px rgba(67,56,202,0.30)",
  },
  pageHeaderTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#1E1B4B",
    margin: "0 0 2px",
    letterSpacing: "-0.01em",
  },
  pageHeaderSub: {
    fontSize: 11,
    color: "#6366F1",
    margin: 0,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  btnEditar: {
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 700,
    color: "#fff",
    background: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)",
    border: "none",
    borderRadius: 9,
    padding: "9px 16px",
    cursor: "pointer",
    flexShrink: 0,
    boxShadow: "0 2px 8px rgba(67,56,202,0.28)",
  },

  // ── Filtros ──
  filtroBar: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 16,
    padding: "12px 14px",
    background: "#fff",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
  },
  filtroLinha: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  filtroLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    minWidth: 78,
  },
  diaChips: { display: "flex", flexWrap: "wrap", gap: 6 },
  diaChip: {
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
    background: "#F1F5F9",
    border: "1px solid transparent",
    borderRadius: 999,
    padding: "6px 13px",
    cursor: "pointer",
    transition: "all .12s ease",
  },
  diaChipAtivo: {
    color: "#fff",
    background: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)",
    borderColor: "transparent",
    boxShadow: "0 2px 6px rgba(67,56,202,0.30)",
  },
  inputFiltro: {
    fontFamily: "inherit",
    fontSize: 13,
    color: "#0F172A",
    border: "1px solid #CBD5E1",
    borderRadius: 9,
    padding: "8px 11px",
    background: "#fff",
    flex: 1,
    minWidth: 180,
  },

  // ── Form de edição ──
  card: {
    background: "#fff",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: "16px 18px",
    boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0F172A",
    margin: "0 0 14px",
    display: "flex",
    alignItems: "center",
    gap: 7,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
  },
  fieldWrap: { display: "flex", flexDirection: "column", gap: 5 },
  label: { fontSize: 12, fontWeight: 700, color: "#334155", margin: 0 },
  input: {
    fontFamily: "inherit",
    fontSize: 13,
    color: "#0F172A",
    border: "1px solid #CBD5E1",
    borderRadius: 9,
    padding: "9px 11px",
    background: "#F8FAFC",
    outline: "none",
  },
  tiposWrap: { marginTop: 14 },
  tiposLista: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 },
  tipoChk: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    fontWeight: 600,
    color: "#334155",
    cursor: "pointer",
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    padding: "7px 11px",
  },
  formAcoes: { display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" },
  btnAdicionar: {
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 700,
    color: "#fff",
    background: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)",
    border: "none",
    borderRadius: 9,
    padding: "9px 16px",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(67,56,202,0.24)",
  },
  btnCancelarForm: {
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
    color: "#475569",
    background: "#F1F5F9",
    border: "1px solid #E2E8F0",
    borderRadius: 9,
    padding: "9px 16px",
    cursor: "pointer",
  },
  actions: { display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" },
  btnSalvar: {
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 700,
    color: "#fff",
    background: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)",
    border: "none",
    borderRadius: 9,
    padding: "10px 18px",
    cursor: "pointer",
    boxShadow: "0 3px 10px rgba(67,56,202,0.30)",
  },
  btnCancelar: {
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
    color: "#475569",
    background: "#F1F5F9",
    border: "1px solid #E2E8F0",
    borderRadius: 9,
    padding: "10px 18px",
    cursor: "pointer",
  },

  // ── Grade ──
  grade: { display: "flex", flexDirection: "column", gap: 12 },
  diaCard: {
    background: "#fff",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    boxShadow: "0 2px 10px rgba(15,23,42,0.05)",
    overflow: "hidden",
  },
  diaHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    background: "linear-gradient(135deg, #4F46E5 0%, #4338CA 100%)",
  },
  diaBadge: {
    fontSize: 12,
    fontWeight: 800,
    color: "#4338CA",
    background: "#fff",
    borderRadius: 8,
    padding: "3px 9px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    flexShrink: 0,
  },
  diaTitulo: { fontSize: 14, fontWeight: 700, color: "#fff", margin: 0, flex: 1 },
  diaContagem: {
    fontSize: 11,
    fontWeight: 700,
    color: "#E0E7FF",
    background: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    padding: "3px 10px",
    flexShrink: 0,
  },
  diaChevron: {
    color: "#C7D2FE",
    fontSize: 12,
    lineHeight: 1,
    transition: "transform .2s ease",
    flexShrink: 0,
  },
  diaCorpo: {
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  turnoBloco: {},
  turnoHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  turnoLinha: { flex: 1, height: 1, background: "#E2E8F0" },
  turnoBadgeManha: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 800,
    color: "#B45309",
    background: "#FEF3C7",
    border: "1px solid #FDE68A",
    borderRadius: 999,
    padding: "4px 11px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    flexShrink: 0,
  },
  turnoBadgeTarde: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 800,
    color: "#3730A3",
    background: "#E0E7FF",
    border: "1px solid #C7D2FE",
    borderRadius: 999,
    padding: "4px 11px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    flexShrink: 0,
  },
  turnoVazio: { fontSize: 12, color: "#94A3B8", margin: 0, fontStyle: "italic" },
  itemGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
    gap: 10,
  },
  item: {
    background: "#fff",
    border: "1px solid #E2E8F0",
    borderLeft: "4px solid #6366F1",
    borderRadius: 10,
    padding: "11px 13px",
    boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
  },
  itemEditando: {
    borderColor: "#A5B4FC",
    boxShadow: "0 0 0 3px rgba(99,102,241,0.18)",
  },
  itemTopo: {
    display: "flex",
    gap: 9,
    alignItems: "flex-start",
  },
  itemAvatar: {
    width: 34,
    height: 34,
    borderRadius: 9,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 800,
    flexShrink: 0,
  },
  itemInfo: { display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 },
  itemNome: { fontSize: 13, fontWeight: 700, color: "#0F172A", lineHeight: 1.25 },
  itemFuncao: {
    fontSize: 11,
    fontWeight: 600,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  itemAcoes: { display: "flex", gap: 5, flexShrink: 0 },
  btnIcone: {
    fontFamily: "inherit",
    width: 26,
    height: 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    color: "#4338CA",
    background: "#EEF2FF",
    border: "1px solid #C7D2FE",
    borderRadius: 7,
    cursor: "pointer",
    padding: 0,
  },
  btnIconeAtivo: {
    background: "#4338CA",
    color: "#fff",
    borderColor: "#4338CA",
  },
  btnIconeRemover: {
    color: "#B91C1C",
    background: "#FEF2F2",
    borderColor: "#FECACA",
  },
  tags: { display: "flex", flexWrap: "wrap", gap: 5, marginTop: 9 },
  tag: {
    fontSize: 10.5,
    fontWeight: 700,
    color: "#4338CA",
    background: "#EEF2FF",
    border: "1px solid #E0E7FF",
    borderRadius: 999,
    padding: "3px 9px",
  },

  // ── Vazio ──
  vazio: {
    background: "#F8FAFC",
    border: "1px dashed #CBD5E1",
    borderRadius: 14,
    padding: "34px 20px",
    textAlign: "center",
  },
  vazioIcone: { fontSize: 30, marginBottom: 8, opacity: 0.85 },
  vazioTitulo: { fontSize: 14, fontWeight: 700, color: "#334155", margin: "0 0 6px" },
  vazioSub: { fontSize: 13, color: "#64748B", margin: 0, lineHeight: 1.45 },
};

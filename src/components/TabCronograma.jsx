import { useEffect, useMemo, useState } from "react";
import { updateCronogramaUbs } from "../services/db";
import {
  CRONOGRAMA_CATEGORIAS,
  CRONOGRAMA_TURNOS,
  CRONOGRAMA_TURNO_LABEL,
  DAY_LABEL,
  ORDEM_DIA_SEMANA_GRADE,
  cronogramaTemItens,
  cronogramaUbsIguais,
  itensCronogramaPorDiaTurno,
  labelCategoria,
  labelTipoAtendimento,
  normalizeCronogramaUbs,
  novoItemCronogramaRascunho,
  prepararItemCronogramaParaSalvar,
  tiposAtendimentoParaCategoria,
  validarItemCronogramaRascunho,
} from "../services/cronogramaUbs";

export default function TabCronograma({ cronogramaUbs, profNames = {}, podeEditar, showToast }) {
  const publicado = useMemo(() => normalizeCronogramaUbs(cronogramaUbs), [cronogramaUbs]);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(publicado);
  const [form, setForm] = useState(() => novoItemCronogramaRascunho());
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!editando) setRascunho(publicado);
  }, [publicado, editando]);

  const mapaPublicado = useMemo(() => itensCronogramaPorDiaTurno(publicado), [publicado]);
  const mapaRascunho = useMemo(() => itensCronogramaPorDiaTurno(rascunho), [rascunho]);
  const tiposForm = tiposAtendimentoParaCategoria(form.categoria);
  const rascunhoIgualPublicado = cronogramaUbsIguais(rascunho, publicado);

  function iniciarEdicao() {
    setRascunho(publicado);
    setForm(novoItemCronogramaRascunho());
    setEditando(true);
  }

  function cancelar() {
    setRascunho(publicado);
    setForm(novoItemCronogramaRascunho());
    setEditando(false);
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
    const tipos = tiposAtendimentoParaCategoria(categoria);
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

  function adicionarItem() {
    const erro = validarItemCronogramaRascunho(form);
    if (erro) {
      showToast(erro, "danger");
      return;
    }
    const item = prepararItemCronogramaParaSalvar(form, `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    setRascunho((prev) => normalizeCronogramaUbs({ ...prev, itens: [...prev.itens, item] }));
    setForm(novoItemCronogramaRascunho(form.categoria));
  }

  function removerItem(id) {
    setRascunho((prev) =>
      normalizeCronogramaUbs({ ...prev, itens: prev.itens.filter((item) => item.id !== id) })
    );
  }

  return (
    <div>
      <div style={S.header}>
        <div>
          <h2 style={S.title}>Cronograma da UBS</h2>
          <p style={S.sub}>
            Grade semanal fixa: cada cadastro indica profissional, tipos de atendimento, dia e turno. O cronograma se
            repete toda semana. Agentes e direção consultam; recepção e direção editam.
          </p>
        </div>
        {podeEditar && !editando && (
          <button type="button" style={S.btnEditar} onClick={iniciarEdicao}>
            Editar
          </button>
        )}
      </div>

      {editando ? (
        <>
          <div style={S.card}>
            <p style={S.sectionTitle}>Adicionar atendimento semanal</p>
            <div style={S.formGrid}>
              <Field label="Categoria do profissional">
                <select
                  style={S.input}
                  value={form.categoria}
                  onChange={(e) => aoMudarCategoria(e.target.value)}
                  disabled={salvando}
                >
                  {CRONOGRAMA_CATEGORIAS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nome do profissional">
                <input
                  style={S.input}
                  value={form.nome}
                  onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex.: Dr. Saulo"
                  disabled={salvando}
                />
              </Field>
              <Field label="Dia da semana">
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
              <p style={S.label}>Tipos de atendimento neste turno</p>
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
            <button type="button" style={S.btnAdicionar} disabled={salvando} onClick={adicionarItem}>
              Adicionar ao cronograma
            </button>
          </div>

          <CronogramaGrade mapa={mapaRascunho} editavel onRemover={removerItem} />

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
        <CronogramaGrade mapa={mapaPublicado} />
      ) : (
        <div style={S.vazio} role="status">
          <p style={S.vazioTitulo}>Nenhum cronograma publicado ainda.</p>
          <p style={S.vazioSub}>
            {podeEditar
              ? "Use Editar para cadastrar profissionais, tipos de atendimento, dias e turnos da semana."
              : "A recepção ou a direção ainda não publicaram o cronograma semanal."}
          </p>
        </div>
      )}
    </div>
  );
}

function CronogramaGrade({ mapa, editavel = false, onRemover }) {
  return (
    <div style={S.grade}>
      {ORDEM_DIA_SEMANA_GRADE.map((dia) => (
        <section key={dia} style={S.diaCard}>
          <h3 style={S.diaTitulo}>{DAY_LABEL[dia]}</h3>
          {CRONOGRAMA_TURNOS.map((turno) => {
            const itens = mapa[dia]?.[turno] || [];
            return (
              <div key={turno} style={S.turnoBloco}>
                <p style={S.turnoTitulo}>{CRONOGRAMA_TURNO_LABEL[turno]}</p>
                {itens.length === 0 ? (
                  <p style={S.turnoVazio}>Sem atendimentos cadastrados.</p>
                ) : (
                  <ul style={S.lista}>
                    {itens.map((item) => (
                      <li key={item.id} style={S.item}>
                        <div style={S.itemTopo}>
                          <div>
                            <strong style={S.itemNome}>{item.nome}</strong>
                            <span style={S.itemCategoria}>{labelCategoria(item.categoria)}</span>
                          </div>
                          {editavel && (
                            <button type="button" style={S.btnRemover} onClick={() => onRemover(item.id)}>
                              Remover
                            </button>
                          )}
                        </div>
                        <div style={S.tags}>
                          {item.tipos.map((tipo) => (
                            <span key={tipo} style={S.tag}>
                              {labelTipoAtendimento(item.categoria, tipo)}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      ))}
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
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  title: { fontSize: 17, fontWeight: 700, color: "#0F172A", margin: "0 0 6px" },
  sub: { fontSize: 13, color: "#475569", margin: 0, lineHeight: 1.5, maxWidth: 720 },
  btnEditar: {
    fontSize: 13,
    fontWeight: 600,
    color: "#0C447C",
    background: "#E6F1FB",
    border: "1px solid #BFDBFE",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
    flexShrink: 0,
  },
  card: {
    background: "#fff",
    border: "0.5px solid #E2E8F0",
    borderRadius: 10,
    padding: "14px 16px",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: "#0F172A", margin: "0 0 12px" },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 12,
  },
  fieldWrap: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, fontWeight: 600, color: "#334155", margin: 0 },
  input: {
    fontFamily: "inherit",
    fontSize: 13,
    color: "#0F172A",
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    padding: "8px 10px",
    background: "#F8FAFC",
  },
  tiposWrap: { marginTop: 12 },
  tiposLista: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 },
  tipoChk: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155", cursor: "pointer" },
  btnAdicionar: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: 600,
    color: "#0C447C",
    background: "#E6F1FB",
    border: "1px solid #BFDBFE",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
  },
  actions: { display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" },
  btnSalvar: {
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    background: "#0C447C",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    cursor: "pointer",
  },
  btnCancelar: {
    fontSize: 13,
    fontWeight: 600,
    color: "#475569",
    background: "#F1F5F9",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    padding: "8px 16px",
    cursor: "pointer",
  },
  grade: { display: "flex", flexDirection: "column", gap: 12 },
  diaCard: {
    background: "#fff",
    border: "0.5px solid #E2E8F0",
    borderRadius: 10,
    padding: "12px 14px",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  },
  diaTitulo: { fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 10px" },
  turnoBloco: {
    borderTop: "1px solid #F1F5F9",
    paddingTop: 10,
    marginTop: 10,
  },
  turnoTitulo: { fontSize: 12, fontWeight: 600, color: "#64748B", margin: "0 0 8px", textTransform: "uppercase" },
  turnoVazio: { fontSize: 12, color: "#94A3B8", margin: 0 },
  lista: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 },
  item: {
    background: "#F8FAFC",
    border: "0.5px solid #E2E8F0",
    borderRadius: 8,
    padding: "10px 12px",
  },
  itemTopo: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" },
  itemNome: { display: "block", fontSize: 13, color: "#0F172A" },
  itemCategoria: { display: "block", fontSize: 11, color: "#64748B", marginTop: 2 },
  btnRemover: {
    fontSize: 11,
    color: "#B91C1C",
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    borderRadius: 6,
    padding: "4px 8px",
    cursor: "pointer",
    flexShrink: 0,
  },
  tags: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: {
    fontSize: 11,
    color: "#0C447C",
    background: "#E6F1FB",
    borderRadius: 999,
    padding: "3px 8px",
  },
  vazio: {
    background: "#F8FAFC",
    border: "1px dashed #CBD5E1",
    borderRadius: 10,
    padding: "22px 18px",
    textAlign: "center",
  },
  vazioTitulo: { fontSize: 14, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  vazioSub: { fontSize: 13, color: "#64748B", margin: 0, lineHeight: 1.45 },
};

// CPF (11 dígitos) ou cartão do SUS (15 dígitos)

/** Apenas dígitos, no máximo 15 (cartão SUS). */
export function digitosCpfOuSus(val) {
  return String(val || "")
    .replace(/\D/g, "")
    .slice(0, 15);
}

/** Válido se tiver exatamente 11 (CPF) ou 15 (cartão SUS) dígitos. */
export function isCpfOuCartaoSusCompleto(val) {
  const d = digitosCpfOuSus(val);
  return d.length === 11 || d.length === 15;
}

/**
 * Formata para exibição: CPF 000.000.000-00 (até 11 dígitos); cartão SUS 000 0000 0000 0000 (12–15 dígitos).
 */
export function formatarCpfOuSusDigitos(digitos) {
  const d = digitosCpfOuSus(digitos);
  if (d.length === 0) return "";
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
  }
  const a = d.slice(0, 3);
  const b = d.slice(3, 7);
  const c = d.slice(7, 11);
  const e = d.slice(11, 15);
  const parts = [a];
  if (b.length) parts.push(b);
  if (c.length) parts.push(c);
  if (e.length) parts.push(e);
  return parts.join(" ");
}

export const LABEL_CPF_SUS = "CPF/Cartão do SUS";

export const PLACEHOLDER_CPF_SUS = "CPF ou Cartão do SUS";

export const ERRO_CPF_SUS_INCOMPLETO =
  "Informe o CPF completo (11 dígitos) ou o cartão do SUS completo (15 dígitos).";

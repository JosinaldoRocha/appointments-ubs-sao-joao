// src/components/PasswordInput.jsx
import { useState } from "react";

function IconEye({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

/**
 * Campo de senha com botão de olho para mostrar/ocultar.
 * Passe `inputStyle` com o mesmo estilo do restante dos inputs da tela (ex.: S.input ou styles.input).
 */
export default function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete = "current-password",
  id,
  name,
  inputStyle = {},
  compact = false,
}) {
  const [visible, setVisible] = useState(false);
  const padR = compact ? 36 : 42;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{
          width: "100%",
          boxSizing: "border-box",
          paddingRight: padR,
          ...inputStyle,
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        title={visible ? "Ocultar senha" : "Mostrar senha"}
        onClick={() => setVisible((v) => !v)}
        style={{
          position: "absolute",
          right: compact ? 6 : 8,
          top: "50%",
          transform: "translateY(-50%)",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: compact ? 2 : 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#64748B",
          borderRadius: 6,
        }}
      >
        {visible ? <IconEyeOff size={compact ? 18 : 20} /> : <IconEye size={compact ? 18 : 20} />}
      </button>
    </div>
  );
}

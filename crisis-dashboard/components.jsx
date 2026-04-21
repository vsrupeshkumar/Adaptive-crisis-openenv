/* Shared small components — severity chips, steppers, panels */
(function () {
  const { useState, useEffect, useRef, useCallback } = React;

  function SevChip({ sev, children }) {
    const label = children || sev.toUpperCase();
    return <span className="sev-chip" data-sev={sev}><span className="dot"/>{label}</span>;
  }

  function Stepper({ value, onChange, min = 0, max = 99, disabled, accent }) {
    return (
      <div className="stepper">
        <button disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <div className="val">{value}</div>
        <button disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    );
  }

  function PanelHead({ title, counter, tools }) {
    return (
      <div className="panel-head">
        <h2><span className="dot"/>{title}{counter != null && <span className="counter">· {counter}</span>}</h2>
        {tools && <div className="tools">{tools}</div>}
      </div>
    );
  }

  function ResourceBar({ idle, busy, total, color }) {
    const idlePct = total > 0 ? (idle / total) * 100 : 0;
    const busyPct = total > 0 ? (busy / total) * 100 : 0;
    return (
      <div className="resource-bar">
        <div className="idle" style={{ width: `${idlePct}%`, background: color }}/>
        <div className="busy" style={{ width: `${busyPct}%` }}/>
      </div>
    );
  }

  Object.assign(window, { SevChip, Stepper, PanelHead, ResourceBar });
})();

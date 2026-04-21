/* Design tweaks panel — floating bottom-right, only when visible */
(function () {
  function Tweaks({ visible, settings, setSettings, onClose }) {
    if (!visible) return null;

    const Seg = ({ label, k, opts }) => (
      <div className="tweak-row">
        <label>{label}</label>
        <div className="tweak-seg">
          {opts.map(([val, text]) => (
            <button
              key={String(val)}
              className={settings[k] === val ? 'on' : ''}
              onClick={() => setSettings({ ...settings, [k]: val })}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    );

    return (
      <div className="tweaks-panel">
        <div className="tweaks-head">
          <h3>DESIGN TWEAKS</h3>
          <button className="close" onClick={onClose}>✕</button>
        </div>
        <div className="tweaks-body">
          <Seg label="THEME" k="theme" opts={[['dark','DARK'],['light','LIGHT']]} />
          <Seg label="DENSITY" k="density" opts={[['comfortable','COMFY'],['dense','DENSE']]} />
          <Seg label="TASK" k="task" opts={[[1,'1'],[2,'2'],[3,'3']]} />
          <Seg label="ANIMATIONS" k="animations" opts={[['off','OFF'],['subtle','SUBTLE'],['rich','RICH']]} />
          <Seg label="CVD SAFE" k="cvdSafe" opts={[[false,'OFF'],[true,'ON']]} />
          <Seg label="MAP STYLE" k="mapStyle" opts={[['hex','HEX'],['list','LIST']]} />
          <Seg label="EXPERT VIEW" k="expertView" opts={[[false,'BASIC'],[true,'EXPERT']]} />
        </div>
      </div>
    );
  }

  window.Tweaks = Tweaks;
})();

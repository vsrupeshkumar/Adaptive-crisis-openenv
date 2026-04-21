/* Hex / network map */
(function () {
  const { useState, useRef, useMemo } = React;
  const { FireRank, PatRank, TrafRank, Fire, Pat, Traf } = window.Sim;

  // Severity → color CSS var (fire dominant, patient secondary)
  function zoneColorVar(z) {
    const f = FireRank[z.fire] || 0;
    const p = PatRank[z.patient] || 0;
    const t = TrafRank[z.traffic] || 0;
    const sev = Math.max(f, p >= 3 ? 3 : p >= 1 ? 2 : 0, t);
    if (sev === 0) return 'var(--sev-none)';
    if (sev === 1) return 'var(--sev-low)';
    if (sev === 2) return 'var(--sev-med)';
    if (sev === 3) return 'var(--sev-high)';
    if (sev === 4) return 'var(--sev-crit)';
    return 'var(--sev-cata)';
  }
  function zoneSevLabel(z) {
    const f = FireRank[z.fire] || 0;
    const p = PatRank[z.patient] || 0;
    const t = TrafRank[z.traffic] || 0;
    const sev = Math.max(f, p >= 3 ? 3 : p >= 1 ? 2 : 0, t);
    return ['clear', 'low', 'moderate', 'high', 'critical', 'catastrophic'][sev];
  }

  // axial hex coords → pixel (flat-top, size=radius)
  function hexToPixel(q, r, size) {
    const x = size * (3/2) * q;
    const y = size * (Math.sqrt(3) * (r + q/2));
    return { x, y };
  }
  function hexCorners(cx, cy, size) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      pts.push(`${cx + size * Math.cos(a)},${cy + size * Math.sin(a)}`);
    }
    return pts.join(' ');
  }

  function TacticalMap({ obs, task, selected, onSelect, style }) {
    const [hover, setHover] = useState(null);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const wrapRef = useRef(null);

    const size = 72;
    const coords = task.coords;
    const zoneEntries = Object.entries(obs.zones);

    // compute bbox
    const pxCoords = Object.fromEntries(
      zoneEntries.map(([zid]) => {
        const c = coords[zid] || { q: 0, r: 0 };
        return [zid, hexToPixel(c.q, c.r, size)];
      })
    );
    const pad = size * 1.4;
    const xs = Object.values(pxCoords).map(p => p.x);
    const ys = Object.values(pxCoords).map(p => p.y);
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    const vw = maxX - minX, vh = maxY - minY;

    // background grid (dots)
    const gridDots = [];
    for (let x = minX; x <= maxX; x += 24) {
      for (let y = minY; y <= maxY; y += 24) {
        gridDots.push(<circle key={`${x},${y}`} cx={x} cy={y} r="0.8" fill="var(--line-soft)"/>);
      }
    }

    // edges
    const edges = [];
    if (task.adjacency) {
      const seen = new Set();
      for (const [a, nbs] of Object.entries(task.adjacency)) {
        for (const b of nbs) {
          const k = [a, b].sort().join('|');
          if (seen.has(k)) continue;
          seen.add(k);
          const pa = pxCoords[a], pb = pxCoords[b];
          if (!pa || !pb) continue;
          edges.push(<line key={k} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="var(--line-strong)" strokeWidth="0.8" strokeDasharray="3 4" opacity="0.6"/>);
        }
      }
    }

    const onEnter = (e, zid) => {
      setHover(zid);
      if (wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect();
        setPos({ x: e.clientX - rect.left + 14, y: e.clientY - rect.top + 14 });
      }
    };
    const onMove = (e) => {
      if (wrapRef.current) {
        const rect = wrapRef.current.getBoundingClientRect();
        setPos({ x: e.clientX - rect.left + 14, y: e.clientY - rect.top + 14 });
      }
    };

    return (
      <div className="map-wrap" ref={wrapRef}>
        <svg viewBox={`${minX} ${minY} ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="hotGlow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="var(--accent-hot)" stopOpacity="0.5"/>
              <stop offset="100%" stopColor="var(--accent-hot)" stopOpacity="0"/>
            </radialGradient>
          </defs>
          {gridDots}
          {edges}
          {zoneEntries.map(([zid, z]) => {
            const p = pxCoords[zid];
            const col = zoneColorVar(z);
            const isHot = z.fire === Fire.HIGH || z.fire === Fire.CATASTROPHIC || z.patient === Pat.CRITICAL;
            const isSel = selected === zid;
            const sev = zoneSevLabel(z);
            return (
              <g key={zid} className={`hex-cell ${isSel ? 'selected' : ''} ${isHot ? 'sev-pulse' : ''}`}
                 onMouseEnter={(e) => onEnter(e, zid)}
                 onMouseMove={onMove}
                 onMouseLeave={() => setHover(null)}
                 onClick={() => onSelect(zid)}>
                {isHot && <circle cx={p.x} cy={p.y} r={size * 1.6} fill="url(#hotGlow)"/>}
                <polygon
                  points={hexCorners(p.x, p.y, size)}
                  fill={col}
                  fillOpacity={sev === 'clear' ? 0.08 : 0.22}
                  stroke={col}
                  strokeWidth={isSel ? 2 : 1}
                  strokeOpacity={sev === 'clear' ? 0.4 : 0.9}
                />
                {/* inner detail */}
                <polygon
                  points={hexCorners(p.x, p.y, size * 0.76)}
                  fill="none"
                  stroke={col}
                  strokeWidth="0.4"
                  strokeOpacity="0.35"
                />
                <text x={p.x} y={p.y - 4} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="12" fontWeight="700" fill="var(--ink-0)" style={{ letterSpacing: '0.1em' }}>
                  {zid.toUpperCase()}
                </text>
                <text x={p.x} y={p.y + 14} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill={col} style={{ letterSpacing: '0.12em' }}>
                  {sev.toUpperCase()}
                </text>
                {/* hazard micro-badges */}
                <g transform={`translate(${p.x - 28}, ${p.y + 28})`}>
                  {z.fire !== Fire.NONE && <rect x="0" y="0" width="14" height="4" fill="var(--fire-color)" rx="1"/>}
                  {z.patient !== Pat.NONE && z.patient !== Pat.FATAL && <rect x="18" y="0" width="14" height="4" fill="var(--amb-color)" rx="1"/>}
                  {(z.traffic === Traf.HEAVY || z.traffic === Traf.GRIDLOCK) && <rect x="36" y="0" width="14" height="4" fill="var(--pol-color)" rx="1"/>}
                </g>
              </g>
            );
          })}
        </svg>

        {/* overlays */}
        <div className="map-toolbar">
          <button className="active">HEX</button>
          <button onClick={() => {}}>TACT</button>
        </div>
        <div className="compass">N · 47°36'32"</div>
        <div className="map-legend">
          <div className="item"><span className="sw" style={{ background: 'var(--sev-low)' }}/>LOW</div>
          <div className="item"><span className="sw" style={{ background: 'var(--sev-med)' }}/>MED</div>
          <div className="item"><span className="sw" style={{ background: 'var(--sev-high)' }}/>HIGH</div>
          <div className="item"><span className="sw" style={{ background: 'var(--sev-crit)' }}/>CRIT</div>
          <div className="item"><span className="sw" style={{ background: 'var(--sev-cata)' }}/>CATA</div>
        </div>
        <div className="map-coords">ZONES {zoneEntries.length} · WX {obs.weather.toUpperCase()}</div>

        {hover && obs.zones[hover] && (
          <div className="zone-tooltip" style={{ left: pos.x, top: pos.y }}>
            <h4>{hover.toUpperCase()} <SevChip sev={zoneSevLabel(obs.zones[hover])}/></h4>
            <div className="rows">
              <div className="r"><span>FIRE</span><span>{obs.zones[hover].fire.toUpperCase()}</span></div>
              <div className="r"><span>PATIENT</span><span>{obs.zones[hover].patient.toUpperCase()}</span></div>
              <div className="r"><span>TRAFFIC</span><span>{obs.zones[hover].traffic.toUpperCase()}</span></div>
              <div className="r"><span>REQ FIRE</span><span>{window.Sim.requiredFire(obs.zones[hover].fire, obs.weather)}</span></div>
              <div className="r"><span>REQ AMB</span><span>{window.Sim.requiredAmb(obs.zones[hover].patient)}</span></div>
            </div>
          </div>
        )}
      </div>
    );
  }

  Object.assign(window, { TacticalMap, zoneColorVar, zoneSevLabel });
})();

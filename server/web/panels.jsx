/* Dispatch, Resources, Timeline, Reward chart, Assistant, Reference drawers */
(function () {
  const { useState, useEffect, useRef, useMemo } = React;
  const { FireRank, PatRank, Fire, Pat, Traf, requiredFire, requiredAmb } = window.Sim;

  function ResourcePanel({ obs, task }) {
    const totalF = task.pool.fire, totalA = task.pool.amb, totalP = task.pool.pol;
    const row = (label, swatch, idle, busy, total, color, depleted) => (
      <div className={`resource ${depleted ? 'depleted' : ''}`}>
        <div className="resource-head">
          <div className="resource-label"><span className="swatch" style={{ background: swatch }}/>{label}</div>
          <div className="resource-count">{idle}<span className="of">/{total}</span></div>
        </div>
        <ResourceBar idle={idle} busy={busy} total={total} color={color}/>
        <div className="resource-sub"><span>IDLE <b>{idle}</b></span><span>BUSY <b>{busy}</b></span></div>
      </div>
    );
    return (
      <div className="resource-list">
        {row('FIRE', 'var(--fire-color)', obs.idle.fire, obs.busy.fire, totalF, 'var(--fire-color)', obs.idle.fire === 0 && totalF > 0)}
        {row('AMBULANCE', 'var(--amb-color)', obs.idle.amb, obs.busy.amb, totalA, 'var(--amb-color)', obs.idle.amb === 0 && totalA > 0)}
        {row('POLICE', 'var(--pol-color)', obs.idle.pol, obs.busy.pol, totalP, 'var(--pol-color)', obs.idle.pol === 0 && totalP > 0)}
      </div>
    );
  }

  function DispatchCard({ zid, z, weather, alloc, onChange, idlePool, selected, onSelect }) {
    const reqF = requiredFire(z.fire, weather);
    const reqA = requiredAmb(z.patient);
    const needT = z.traffic === Traf.HEAVY || z.traffic === Traf.GRIDLOCK;
    const hasActive = reqF > 0 || reqA > 0 || needT;
    const maxF = (alloc.fire || 0) + idlePool.fire;
    const maxA = (alloc.amb || 0) + idlePool.amb;
    const fStatus = (alloc.fire || 0) < reqF ? 'warn' : (alloc.fire || 0) > reqF ? 'over' : (alloc.fire || 0) === reqF && reqF > 0 ? 'ok' : '';
    const aStatus = (alloc.amb || 0) < reqA ? 'warn' : (alloc.amb || 0) > reqA ? 'over' : (alloc.amb || 0) === reqA && reqA > 0 ? 'ok' : '';
    const f = alloc.fire || 0, a = alloc.amb || 0, p = !!alloc.pol;
    const sev = (FireRank[z.fire]||0) >= 3 || z.patient === Pat.CRITICAL ? 'hot' : hasActive ? 'active' : 'clear';
    return (
      <div className="dispatch-card" data-active={sev} onClick={() => onSelect(zid)}>
        <div className="dispatch-card-head">
          <h3>{zid.toUpperCase()}</h3>
          <div className="chip-row">
            {z.fire !== Fire.NONE && <SevChip sev={z.fire}>F·{z.fire}</SevChip>}
            {z.patient !== Pat.NONE && z.patient !== Pat.FATAL && <SevChip sev={z.patient === 'moderate' ? 'medium' : 'critical'}>M·{z.patient}</SevChip>}
            {(z.traffic === Traf.HEAVY || z.traffic === Traf.GRIDLOCK) && <SevChip sev={z.traffic === Traf.GRIDLOCK ? 'high' : 'medium'}>T·{z.traffic}</SevChip>}
            {!hasActive && <SevChip sev="low">CLEAR</SevChip>}
          </div>
        </div>
        <div className="dispatch-card-body">
          <div className="dispatch-slot fire">
            <div className="dispatch-slot-head"><span>FIRE</span><span className={`req ${fStatus}`}>REQ {reqF}</span></div>
            <Stepper value={f} onChange={v => onChange({ ...alloc, fire: v })} min={0} max={maxF}/>
          </div>
          <div className="dispatch-slot amb">
            <div className="dispatch-slot-head"><span>AMB</span><span className={`req ${aStatus}`}>REQ {reqA}{z.traffic === Traf.GRIDLOCK ? '+1' : ''}</span></div>
            <Stepper value={a} onChange={v => onChange({ ...alloc, amb: v })} min={0} max={maxA}/>
          </div>
          <div className="dispatch-slot pol">
            <div className="dispatch-slot-head"><span>POL</span><span className={`req ${needT ? 'warn' : ''}`}>{needT ? 'NEED' : '—'}</span></div>
            <button className={`toggle ${p ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onChange({ ...alloc, pol: !p }); }} disabled={!p && idlePool.pol === 0}>
              {p ? '● DEPLOYED' : '○ DEPLOY'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function DispatchPanel({ obs, task, allocations, setAllocations, selected, onSelect, onSuggest, onClear }) {
    const idleRemain = useMemo(() => {
      let f = obs.idle.fire, a = obs.idle.amb, p = obs.idle.pol;
      for (const [, al] of Object.entries(allocations)) {
        f -= al.fire || 0; a -= al.amb || 0; p -= al.pol ? 1 : 0;
      }
      return { fire: Math.max(0,f), amb: Math.max(0,a), pol: Math.max(0,p) };
    }, [obs, allocations]);
    return (
      <div>
        <div className="dispatch-list">
          {Object.entries(obs.zones).map(([zid, z]) => (
            <DispatchCard key={zid} zid={zid} z={z} weather={obs.weather}
              alloc={allocations[zid] || { fire: 0, amb: 0, pol: false }}
              onChange={(a) => setAllocations({ ...allocations, [zid]: a })}
              idlePool={idleRemain} selected={selected === zid} onSelect={onSelect}/>
          ))}
        </div>
      </div>
    );
  }

  function Timeline({ events }) {
    const ref = useRef(null);
    useEffect(() => {
      if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    }, [events.length]);
    if (!events.length) return <div className="tl-empty">NO EVENTS · AWAITING DISPATCH</div>;
    return (
      <div className="timeline" ref={ref}>
        {events.slice().reverse().map(e => (
          <div className="tl-item" data-kind={e.kind} key={e.id}>
            <div className="tl-step">T+{String(e.step).padStart(2,'0')}</div>
            <div className="tl-kind"/>
            <div className="tl-msg">{e.msg}</div>
            <div className="tl-meta">{e.kind.toUpperCase()}</div>
          </div>
        ))}
      </div>
    );
  }

  function RewardChart({ history, totalReward, score, maxSteps }) {
    const ref = useRef(null);
    const w = 700, h = 140, padL = 36, padR = 12, padT = 12, padB = 22;
    const data = history;
    const maxAbs = Math.max(10, ...data.map(d => Math.abs(d.reward || 0))) + 2;
    const xStep = (w - padL - padR) / Math.max(maxSteps, 1);
    const yMid = padT + (h - padT - padB) / 2;
    const yScale = (h - padT - padB) / 2 / maxAbs;
    const gridLines = [];
    for (let i = 0; i <= 4; i++) {
      const y = padT + ((h - padT - padB) / 4) * i;
      gridLines.push(<line key={i} x1={padL} y1={y} x2={w-padR} y2={y} stroke="var(--line-soft)" strokeWidth="0.5"/>);
    }
    const bars = data.map((d, i) => {
      const x = padL + i * xStep;
      const bw = Math.max(2, xStep - 2);
      const y = d.reward >= 0 ? yMid - d.reward * yScale : yMid;
      const height = Math.abs(d.reward) * yScale;
      const fill = d.reward >= 0 ? 'var(--accent-ok)' : 'var(--accent-hot)';
      return <rect key={i} x={x} y={y} width={bw} height={height} fill={fill} opacity="0.9"/>;
    });
    let cum = 0;
    const linePts = data.map((d, i) => {
      cum += d.reward;
      const x = padL + i * xStep + xStep/2;
      const y = yMid - Math.max(-maxAbs, Math.min(maxAbs, cum/3)) * yScale;
      return `${x},${y}`;
    }).join(' ');
    return (
      <div className="reward-chart-wrap">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          {gridLines}
          <line x1={padL} y1={yMid} x2={w-padR} y2={yMid} stroke="var(--line-strong)" strokeWidth="0.6"/>
          <text x={padL - 4} y={yMid + 3} textAnchor="end" fontFamily="JetBrains Mono" fontSize="8" fill="var(--ink-3)" letterSpacing="0.08em">0</text>
          <text x={padL - 4} y={padT + 6} textAnchor="end" fontFamily="JetBrains Mono" fontSize="8" fill="var(--ink-3)" letterSpacing="0.08em">+{maxAbs.toFixed(0)}</text>
          <text x={padL - 4} y={h - padB + 2} textAnchor="end" fontFamily="JetBrains Mono" fontSize="8" fill="var(--ink-3)" letterSpacing="0.08em">−{maxAbs.toFixed(0)}</text>
          {bars}
          {data.length > 1 && <polyline points={linePts} fill="none" stroke="var(--accent)" strokeWidth="1.2" opacity="0.8" strokeDasharray="2 3"/>}
          {Array.from({ length: maxSteps + 1 }).map((_, i) => (
            i % 5 === 0 ? <text key={i} x={padL + i * xStep} y={h - 6} fontFamily="JetBrains Mono" fontSize="8" fill="var(--ink-3)" letterSpacing="0.08em">T{i}</text> : null
          ))}
        </svg>
      </div>
    );
  }

  function RewardPanel({ history, obs, score }) {
    const last = history.length ? history[history.length-1] : null;
    const resolved = obs.resolved;
    const total = obs.totalIncidents;
    const pct = total > 0 ? Math.round((resolved/total)*100) : 0;
    return (
      <div className="reward-wrap">
        <div className="reward-stats">
          <div className="reward-stat">
            <div className="k">Cumulative</div>
            <div className={`v ${obs.totalReward >= 0 ? 'pos' : 'neg'}`}>{obs.totalReward >= 0 ? '+' : ''}{obs.totalReward.toFixed(2)}</div>
            <div className="delta">{history.length} steps</div>
          </div>
          <div className="reward-stat">
            <div className="k">Last R</div>
            <div className={`v ${last && last.reward >= 0 ? 'pos' : last && last.reward < 0 ? 'neg' : ''}`}>
              {last ? (last.reward >= 0 ? '+' : '') + last.reward.toFixed(2) : '—'}
            </div>
            <div className="delta">base {last ? last.base.toFixed(1) : '—'} · waste −{last ? last.waste.toFixed(1) : '0'}</div>
          </div>
          <div className="reward-stat">
            <div className="k">Resolved</div>
            <div className="v">{resolved}<span className="muted" style={{ fontSize: 12 }}>/{total}</span></div>
            <div className="delta">{pct}% of incidents</div>
          </div>
          <div className="reward-stat">
            <div className="k">Score</div>
            <div className="v">{score.toFixed(3)}</div>
            <div className="delta">grader composite</div>
          </div>
        </div>
        <RewardChart history={history} totalReward={obs.totalReward} score={score} maxSteps={obs.maxSteps}/>
      </div>
    );
  }

  // --- Assistant ---
  function buildCannedReply(obs, task) {
    const hot = Object.entries(obs.zones).filter(([,z]) =>
      z.fire === Fire.HIGH || z.fire === Fire.CATASTROPHIC || z.patient === Pat.CRITICAL
    );
    const idle = obs.idle;
    if (obs.isDone) {
      return `Episode closed. Final score reflects ${obs.resolved} of ${obs.totalIncidents} incidents resolved. Debrief recommended — review Reward Trajectory for waste spikes at steps with low base reward.`;
    }
    if (!hot.length) {
      return `All zones stable. Conserve resources — avoid over-dispatching to LOW/MEDIUM incidents (waste penalty weight is 2× at these severities). Idle pool: ${idle.fire}F / ${idle.amb}A / ${idle.pol}P.`;
    }
    const [zid, z] = hot[0];
    const reqF = window.Sim.requiredFire(z.fire, obs.weather);
    const reqA = window.Sim.requiredAmb(z.patient);
    return `Priority: ${zid.toUpperCase()}. Recommend ${reqF}F + ${reqA}A${z.traffic === Traf.GRIDLOCK ? ' +1P (gridlock)' : ''}. Weather ${obs.weather} inflates fire requirement by ${obs.weather === 'hurricane' ? '50%' : obs.weather === 'storm' ? '25%' : '0%'}. Don't neglect adjacent zones — Hard mode cascades at HIGH+ severity.`;
  }
  function Assistant({ obs, task, score }) {
    const [msgs, setMsgs] = useState([
      { role: 'assistant', text: 'Assistant online. I can explain the reward ledger, suggest dispatches, or summarize zone state. Ask anything.' }
    ]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const listRef = useRef(null);
    useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [msgs.length, busy]);

    const send = async (prompt) => {
      const text = prompt || input.trim();
      if (!text || busy) return;
      setInput('');
      setMsgs(m => [...m, { role: 'user', text }]);
      setBusy(true);
      const context = `You are the NLP tactical assistant in an emergency ops center. Current state:
- Task: ${task.name} (${task.level}), step ${obs.step}/${obs.maxSteps}
- Weather: ${obs.weather}
- Zones: ${Object.entries(obs.zones).map(([k,z]) => `${k}[fire=${z.fire}, patient=${z.patient}, traffic=${z.traffic}]`).join('; ')}
- Idle pool: ${obs.idle.fire}F / ${obs.idle.amb}A / ${obs.idle.pol}P
- Cumulative reward: ${obs.totalReward.toFixed(2)}, resolved ${obs.resolved}/${obs.totalIncidents}

The user asks: ${text}

Respond in 2-3 sentences, tactical and concise. Use domain terms (FEMA types, Mercalli, OCHA tiers) where relevant.`;
      let reply;
      try {
        if (window.claude && window.claude.complete) {
          reply = await window.claude.complete(context);
        } else {
          throw new Error('no claude');
        }
      } catch (e) {
        await new Promise(r => setTimeout(r, 600));
        reply = buildCannedReply(obs, task) + (text.toLowerCase().includes('why') ? ' Reasoning: rewards decay via γ=0.99; cascades trigger after 3 consecutive insufficient dispatches.' : '');
      }
      setMsgs(m => [...m, { role: 'assistant', text: reply }]);
      setBusy(false);
    };

    const suggestions = [
      'What should I do this step?',
      'Explain the reward breakdown',
      'Why did cascades trigger?',
      'Draft a broadcast message',
    ];

    return (
      <div className="assistant">
        <div className="assist-messages" ref={listRef}>
          {msgs.map((m, i) => (
            <div key={i} className={`assist-msg ${m.role}`}>
              {m.role === 'assistant' && <div className="tag"><span className="tag-dot"/>TAC · GPT</div>}
              {m.text}
            </div>
          ))}
          {busy && <div className="assist-msg assistant"><div className="tag"><span className="tag-dot"/>TAC · GPT</div><div className="typing"><span/><span/><span/></div></div>}
        </div>
        <div className="assist-input-wrap">
          <div className="assist-suggest">
            {suggestions.map(s => <button key={s} onClick={() => send(s)} disabled={busy}>{s}</button>)}
          </div>
          <div className="assist-input">
            <textarea rows="2" placeholder="Ask for recommendation…" value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}/>
            <button onClick={() => send()} disabled={busy || !input.trim()}>SEND</button>
          </div>
        </div>
      </div>
    );
  }

  // --- Broadcast composer ---
  function Broadcast({ value, onChange, obs }) {
    const templates = [
      (z) => `ALERT: ${z.toUpperCase()} residents — shelter in place, avoid all fire routes.`,
      (z) => `EVACUATE ${z.toUpperCase()} immediately via designated evac corridors. Ambulances en route.`,
      (z) => `WARNING: ${z.toUpperCase()} critical medical incident. Keep roads clear for emergency units.`,
    ];
    const hot = Object.entries(obs.zones).find(([,z]) =>
      z.fire === Fire.HIGH || z.fire === Fire.CATASTROPHIC || z.patient === Pat.CRITICAL
    );
    const targetZone = hot ? hot[0] : Object.keys(obs.zones)[0];
    return (
      <div className="broadcast">
        <div className="bhead">
          <h3>Public Broadcast</h3>
          <span className="char">{value.length}/240</span>
        </div>
        <textarea rows="2" value={value} maxLength={240}
          placeholder="ALERT: [Zone] has a [severity] [hazard]. Residents must [action] immediately."
          onChange={e => onChange(e.target.value)}/>
        <div className="tmpl">
          {templates.map((t, i) => <button key={i} onClick={() => onChange(t(targetZone))}>TPL {i+1}</button>)}
        </div>
      </div>
    );
  }

  // --- Reference drawers ---
  const REF_DATA = {
    FEMA: {
      title: 'FEMA Incident Types',
      sub: 'Incident Command System — Type Classification',
      body: (
        <>
          <div className="ref-section">
            <p>ICS types describe incident complexity and required resource scale, from Type 5 (routine, local) to Type 1 (catastrophic, multi-agency).</p>
            <table className="ref-table">
              <thead><tr><th>Type</th><th>Profile</th><th>Resources</th></tr></thead>
              <tbody>
                <tr><td className="num">5</td><td>Small, contained — 1-shift</td><td>1–6 responders</td></tr>
                <tr><td className="num">4</td><td>Local, extends beyond shift</td><td>Multiple resources</td></tr>
                <tr><td className="num">3</td><td>Regional, IMT activated</td><td>Multi-branch</td></tr>
                <tr><td className="num">2</td><td>State mobilization</td><td>200+ personnel</td></tr>
                <tr><td className="num">1</td><td>National, FEMA-led</td><td>500+ personnel</td></tr>
              </tbody>
            </table>
          </div>
          <div className="ref-section">
            <h3>Mapping to this simulation</h3>
            <p>Task 1 (Easy) ≈ Type 4–5. Task 2 (Medium) ≈ Type 3. Task 3 (Hard) ≈ Type 2 with cascading elements — mid-episode spawns simulate the unstable expansion phase.</p>
          </div>
        </>
      )
    },
    OCHA: {
      title: 'OCHA Severity Tiers',
      sub: 'UN Office for the Coordination of Humanitarian Affairs',
      body: (
        <>
          <div className="ref-section">
            <p>OCHA tiers classify affected-population severity for coordinated humanitarian response. Used when triaging multi-zone events.</p>
            <table className="ref-table">
              <thead><tr><th>Tier</th><th>Severity</th><th>Indicators</th></tr></thead>
              <tbody>
                <tr><td className="num">1</td><td>None / minimal</td><td>Baseline service continuity</td></tr>
                <tr><td className="num">2</td><td>Stress</td><td>Localized strain</td></tr>
                <tr><td className="num">3</td><td>Severe</td><td>Systems degraded, aid required</td></tr>
                <tr><td className="num">4</td><td>Extreme</td><td>Mass displacement, food insecurity</td></tr>
                <tr><td className="num">5</td><td>Catastrophic</td><td>Collapse of services, famine risk</td></tr>
              </tbody>
            </table>
          </div>
        </>
      )
    },
    MERCALLI: {
      title: 'Modified Mercalli Intensity',
      sub: 'Seismic intensity scale — felt effects',
      body: (
        <>
          <div className="ref-section">
            <p>Mercalli (I–XII) describes earthquake effects at a location, unlike Richter which measures magnitude at source. Used in this sim as a proxy for structural hazard level.</p>
            <table className="ref-table">
              <thead><tr><th>MMI</th><th>Perceived</th><th>Damage</th></tr></thead>
              <tbody>
                <tr><td className="num">I–III</td><td>Not felt / weak</td><td>None</td></tr>
                <tr><td className="num">IV</td><td>Light</td><td>Rattling, no damage</td></tr>
                <tr><td className="num">V–VI</td><td>Moderate / strong</td><td>Plaster cracks</td></tr>
                <tr><td className="num">VII</td><td>Very strong</td><td>Damage to poor masonry</td></tr>
                <tr><td className="num">VIII–IX</td><td>Severe / violent</td><td>Chimney collapse, frame shift</td></tr>
                <tr><td className="num">X–XI</td><td>Extreme</td><td>Most masonry destroyed</td></tr>
                <tr><td className="num">XII</td><td>Total</td><td>Total destruction</td></tr>
              </tbody>
            </table>
          </div>
        </>
      )
    },
    REWARD: {
      title: 'Reward Ledger',
      sub: 'Six-component scoring identity',
      body: (
        <>
          <div className="ref-section">
            <p>Every step produces an auditable ledger: <b style={{ fontFamily: 'var(--ff-mono)', color: 'var(--ink-0)' }}>base + nlp − waste + efficiency − time + multi_obj = total</b>. Discount γ=0.99 applied to the MDP signal.</p>
            <table className="ref-table">
              <thead><tr><th>Component</th><th>Range</th><th>Source</th></tr></thead>
              <tbody>
                <tr><td>base_dispatch_score</td><td className="num">[−9, +8] / zone</td><td>Resolution quality</td></tr>
                <tr><td>nlp_semantic_bonus</td><td className="num">(−∞, +1.0]</td><td>Broadcast grader</td></tr>
                <tr><td>waste_penalty</td><td className="num">[0, ∞)</td><td>Severity-weighted excess</td></tr>
                <tr><td>efficiency_bonus</td><td className="num">[0, +0.5]</td><td>Resources saved</td></tr>
                <tr><td>time_penalty</td><td className="num">0.1 / step</td><td>Constant cost</td></tr>
                <tr><td>multi_obj</td><td className="num">−2.0 .. +3.0</td><td>Δ severity × 1.5</td></tr>
              </tbody>
            </table>
          </div>
          <div className="ref-section">
            <h3>Failure modes</h3>
            <p><b style={{ color: 'var(--accent-hot)' }}>Inventory breach</b> (request &gt; idle): −15.0 flat, action voided. <b style={{ color: 'var(--accent-hot)' }}>Lazy agent</b> (zero dispatch with active hazard): −4 to −9 plus cascade after 2 repeats.</p>
          </div>
        </>
      )
    },
  };

  function Drawer({ which, onClose }) {
    const ref = REF_DATA[which];
    if (!ref) return null;
    return (
      <>
        <div className="drawer-overlay" onClick={onClose}/>
        <div className="drawer" role="dialog" aria-labelledby="drw-title">
          <div className="drawer-head">
            <div>
              <h2 id="drw-title">{ref.title}</h2>
              <div className="sub">{ref.sub}</div>
            </div>
            <button onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="drawer-body">{ref.body}</div>
        </div>
      </>
    );
  }

  Object.assign(window, {
    ResourcePanel, DispatchPanel, Timeline, RewardPanel, Assistant, Broadcast, Drawer, REF_DATA,
  });
})();

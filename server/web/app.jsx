/* App orchestrator — state, hotkeys, layout, edit-mode protocol */
(function () {
  const { useState, useEffect, useRef, useMemo, useCallback } = React;
  const {
    CrisisEnv, TASKS, Fire, Pat, Traf, FireRank, PatRank, TrafRank,
    requiredFire, requiredAmb, countIncidents,
  } = window.Sim;
  const {
    SevChip, Stepper, PanelHead, ResourceBar,
    TacticalMap, zoneColorVar, zoneSevLabel,
    ResourcePanel, DispatchPanel, Timeline, RewardPanel, Assistant,
    Broadcast, Drawer, REF_DATA, Tweaks,
  } = window;

  // ------- Persisted settings (edit-mode protocol) -------
  function useSettings() {
    const [settings, _set] = useState(() => ({ ...window.TWEAK_DEFAULTS }));
    const setSettings = useCallback((next) => {
      _set(next);
      // notify host of changes so persisted defaults can be written back
      try { window.parent && window.parent.postMessage({ type: '__edit_mode_set_keys', keys: next }, '*'); } catch (e) {}
    }, []);
    useEffect(() => {
      const onMsg = (ev) => {
        const d = ev.data || {};
        if (d.type === '__activate_edit_mode') {
          // allow host to activate; no-op beyond acknowledgement
          try { window.parent && window.parent.postMessage({ type: '__edit_mode_active' }, '*'); } catch (e) {}
        } else if (d.type === '__edit_mode_set_keys' && d.keys) {
          _set(s => ({ ...s, ...d.keys }));
        }
      };
      window.addEventListener('message', onMsg);
      return () => window.removeEventListener('message', onMsg);
    }, []);
    // reflect theme/density/cvd/anim onto <html>
    useEffect(() => {
      const root = document.documentElement;
      root.dataset.theme = settings.theme;
      root.dataset.density = settings.density;
      root.dataset.cvd = settings.cvdSafe ? 'true' : 'false';
      const mult = settings.animations === 'off' ? 0 : settings.animations === 'rich' ? 1.6 : 1;
      root.style.setProperty('--anim-mult', String(mult));
    }, [settings.theme, settings.density, settings.cvdSafe, settings.animations]);
    return [settings, setSettings];
  }

  function Clock() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
      const id = setInterval(() => setNow(new Date()), 1000);
      return () => clearInterval(id);
    }, []);
    const hh = String(now.getUTCHours()).padStart(2,'0');
    const mm = String(now.getUTCMinutes()).padStart(2,'0');
    const ss = String(now.getUTCSeconds()).padStart(2,'0');
    return <div className="clock">{hh}:{mm}:{ss} UTC</div>;
  }

  function TopBar({ obs, task, onDrawer, onTweaks, status }) {
    const pillClass = status === 'hot' ? 'hot' : status === 'warn' ? 'warn' : '';
    const statusLabel = status === 'hot' ? 'CRITICAL' : status === 'warn' ? 'ELEVATED' : 'NOMINAL';
    return (
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"/>
          <div className="brand-name">ACME <span>OPS</span></div>
        </div>
        <div className="topbar-center">
          <div className="state-cluster">
            <div className="item">TASK <strong>{task.id}</strong></div>
            <div className="item">STEP <strong>{obs.step}/{obs.maxSteps}</strong></div>
            <div className="item">WX <strong>{obs.weather.toUpperCase()}</strong></div>
            <div className="item">RESOLVED <strong>{obs.resolved}/{obs.totalIncidents}</strong></div>
            <div className="item">REWARD <strong>{obs.totalReward.toFixed(1)}</strong></div>
          </div>
        </div>
        <div className="topbar-right">
          <button className="ref-btn" onClick={() => onDrawer('FEMA')}>FEMA</button>
          <button className="ref-btn" onClick={() => onDrawer('OCHA')}>OCHA</button>
          <button className="ref-btn" onClick={() => onDrawer('MERCALLI')}>MMI</button>
          <button className="ref-btn" onClick={() => onDrawer('REWARD')}>REWARD</button>
          <button className="ref-btn" onClick={onTweaks} title="Design tweaks">TWEAKS</button>
          <div className={`status-pill ${pillClass}`}><span className="led"/>{statusLabel}</div>
          <Clock/>
        </div>
      </header>
    );
  }

  function StatusBar({ obs, task, score }) {
    return (
      <footer className="statusbar">
        <div className="sb-group left">
          <span>SEED <b>{task.seedActive}</b></span>
          <span>ZONES <b>{Object.keys(obs.zones).length}</b></span>
          <span>DEPLOYED <b>{obs.busy.fire + obs.busy.amb + obs.busy.pol}</b></span>
          <span>IDLE <b>{obs.idle.fire + obs.idle.amb + obs.idle.pol}</b></span>
        </div>
        <div className="sb-group right">
          <span>SCORE <b>{score.toFixed(3)}</b></span>
          <span>CUM R <b>{obs.totalReward.toFixed(2)}</b></span>
          <span>{obs.isDone ? (obs.success ? 'MISSION · COMPLETE' : 'EPISODE · CLOSED') : 'EPISODE · LIVE'}</span>
        </div>
      </footer>
    );
  }

  function ControlBar({ task, setTask, seed, setSeed, running, onRun, onStep, onReset, onSuggest, onClear, obs, progress }) {
    return (
      <div className="control-bar">
        <div className="task-toggle">
          {[1,2,3].map(t => (
            <button key={t} className={task === t ? 'active' : ''} onClick={() => setTask(t)} disabled={running}>
              TASK {t}
            </button>
          ))}
        </div>
        <div className="control-row">
          <button className={`btn-primary ${obs.isDone ? '' : running ? 'hot' : ''}`} onClick={onRun} disabled={obs.isDone}>
            {running ? '■ PAUSE' : '▶ RUN'}
          </button>
          <button className="btn-ghost" onClick={onStep} disabled={running || obs.isDone}>STEP</button>
          <button className="btn-ghost" onClick={onReset}>RESET</button>
        </div>
        <div className="control-row">
          <button className="btn-ghost" onClick={onSuggest} disabled={obs.isDone}>SUGGEST</button>
          <button className="btn-ghost" onClick={onClear} disabled={obs.isDone}>CLEAR</button>
        </div>
        <div className="seed-row">
          <label>SEED</label>
          <input type="number" value={seed} onChange={e => setSeed(Number(e.target.value) || 0)} disabled={running}/>
        </div>
        <div className="run-progress">
          <div className="run-progress-bar"><div style={{ width: `${progress}%` }}/></div>
          <div className="run-progress-meta">
            <span>EPISODE</span>
            <span>{obs.step}/{obs.maxSteps}</span>
          </div>
        </div>
      </div>
    );
  }

  function ZoneDetail({ zid, obs, weather }) {
    if (!zid || !obs.zones[zid]) {
      return (
        <div className="zone-detail empty">
          <div className="title">NO ZONE SELECTED</div>
          <div className="sub">Click a hex on the tactical map to inspect zone state, required resources, and failure counters.</div>
        </div>
      );
    }
    const z = obs.zones[zid];
    const reqF = requiredFire(z.fire, weather);
    const reqA = requiredAmb(z.patient);
    const sev = zoneSevLabel(z);
    const deployed = obs.deployments.filter(d => d.zone === zid);
    return (
      <div className="zone-detail">
        <div className="zd-head">
          <div>
            <div className="zd-label">{zid.toUpperCase()}</div>
            <div className="zd-coords">SEV · {sev.toUpperCase()}</div>
          </div>
          <div className="zd-badges">
            <SevChip sev={sev}/>
          </div>
        </div>
        <div className="zd-rows">
          <div className="zd-row"><span>FIRE</span><span>{z.fire.toUpperCase()}</span></div>
          <div className="zd-row"><span>PATIENT</span><span>{z.patient.toUpperCase()}</span></div>
          <div className="zd-row"><span>TRAFFIC</span><span>{z.traffic.toUpperCase()}</span></div>
          <div className="zd-row"><span>REQ FIRE</span><span>{reqF}</span></div>
          <div className="zd-row"><span>REQ AMB</span><span>{reqA}{z.traffic === Traf.GRIDLOCK ? ' +1' : ''}</span></div>
          <div className="zd-row"><span>NEED POL</span><span>{(z.traffic === Traf.HEAVY || z.traffic === Traf.GRIDLOCK) ? 'YES' : '—'}</span></div>
          <div className="zd-row"><span>ACTIVE DISPATCH</span><span>{deployed.length}</span></div>
        </div>
      </div>
    );
  }

  function App() {
    const [settings, setSettings] = useSettings();
    const [tweaksOpen, setTweaksOpen] = useState(false);
    const [drawer, setDrawer] = useState(null);

    const [taskId, setTaskId] = useState(settings.task);
    const [seed, setSeed] = useState(settings.seed);
    const envRef = useRef(null);
    if (!envRef.current) envRef.current = new CrisisEnv(taskId, seed);

    const [obs, setObs] = useState(() => envRef.current.observation());
    const [events, setEvents] = useState(() => [...envRef.current.events]);
    const [history, setHistory] = useState([]);
    const [allocations, setAllocations] = useState({});
    const [selected, setSelected] = useState(null);
    const [running, setRunning] = useState(false);
    const [broadcast, setBroadcast] = useState('');
    const [toasts, setToasts] = useState([]);

    // Sync tweaks → task/seed
    useEffect(() => { if (settings.task !== taskId) setTaskId(settings.task); }, [settings.task]);

    // Reset when task or seed changes
    useEffect(() => {
      envRef.current = new CrisisEnv(taskId, seed);
      setObs(envRef.current.observation());
      setEvents([...envRef.current.events]);
      setHistory([]);
      setAllocations({});
      setSelected(null);
      setRunning(false);
      pushToast(`Task ${taskId} initialized · seed ${seed}`, 'info');
    }, [taskId, seed]);

    const pushToast = useCallback((msg, kind = 'info') => {
      const id = Date.now() + Math.random();
      setToasts(t => [...t, { id, msg, kind }]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
    }, []);

    const scoreComposite = useMemo(() => {
      const total = Math.max(1, obs.totalIncidents);
      const resolveRatio = obs.resolved / total;
      const wasteNorm = Math.min(1, (envRef.current.wasted || 0) / Math.max(1, obs.maxSteps * 3));
      return Math.max(0, Math.min(1, 0.7 * resolveRatio + 0.3 * (1 - wasteNorm)));
    }, [obs.resolved, obs.totalIncidents, obs.step, obs.maxSteps, obs.totalReward]);

    const doStep = useCallback(() => {
      if (envRef.current.isDone) return;
      const result = envRef.current.act(allocations);
      const newObs = envRef.current.observation();
      setObs(newObs);
      setEvents([...envRef.current.events]);
      setHistory(h => [...h, { step: newObs.step, reward: result.reward, base: (result.info && result.info.base) || 0, nlp: 0, waste: (result.info && result.info.waste) || 0 }]);
      setAllocations({});
      if (result.info && result.info.breach) pushToast('Inventory breach — action voided (−15)', 'hot');
      if (newObs.isDone) {
        setRunning(false);
        pushToast(newObs.success ? 'Mission complete' : 'Episode closed', newObs.success ? 'ok' : 'warn');
      }
    }, [allocations, pushToast]);

    // Auto-run
    useEffect(() => {
      if (!running) return;
      const id = setInterval(() => {
        if (envRef.current.isDone) { setRunning(false); return; }
        const suggested = envRef.current.suggest();
        const result = envRef.current.act(suggested);
        const newObs = envRef.current.observation();
        setObs(newObs);
        setEvents([...envRef.current.events]);
        setHistory(h => [...h, { step: newObs.step, reward: result.reward, base: (result.info && result.info.base) || 0, nlp: 0, waste: (result.info && result.info.waste) || 0 }]);
        setAllocations({});
        if (newObs.isDone) {
          setRunning(false);
          pushToast(newObs.success ? 'Mission complete' : 'Episode closed', newObs.success ? 'ok' : 'warn');
        }
      }, 900);
      return () => clearInterval(id);
    }, [running, pushToast]);

    const onReset = useCallback(() => {
      envRef.current.reset(seed);
      setObs(envRef.current.observation());
      setEvents([...envRef.current.events]);
      setHistory([]);
      setAllocations({});
      setRunning(false);
      pushToast('Environment reset', 'info');
    }, [seed, pushToast]);

    const onSuggest = useCallback(() => {
      const s = envRef.current.suggest();
      setAllocations(s);
      pushToast('Suggested allocation loaded', 'ok');
    }, [pushToast]);

    const onClear = useCallback(() => setAllocations({}), []);

    // Hotkeys
    useEffect(() => {
      const onKey = (e) => {
        if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
        if (e.code === 'Space') { e.preventDefault(); setRunning(r => !r); }
        else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); onReset(); }
        else if (e.key === 's' || e.key === 'S') { e.preventDefault(); if (!running) doStep(); }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [running, doStep, onReset]);

    // Status pill
    const status = useMemo(() => {
      const hot = Object.values(obs.zones).some(z =>
        z.fire === Fire.HIGH || z.fire === Fire.CATASTROPHIC || z.patient === Pat.CRITICAL
      );
      const warn = Object.values(obs.zones).some(z => z.fire !== Fire.NONE || z.patient !== Pat.NONE);
      return hot ? 'hot' : warn ? 'warn' : 'ok';
    }, [obs.zones]);

    const task = useMemo(() => ({ ...TASKS[taskId], id: taskId, seedActive: seed }), [taskId, seed]);
    const progress = obs.maxSteps > 0 ? (obs.step / obs.maxSteps) * 100 : 0;
    const dispatchCount = Object.keys(obs.zones).length;
    const eventCount = events.length;

    const endResultKind = obs.isDone ? (obs.success ? 'win' : 'loss') : null;

    return (
      <div className="app">
        <TopBar obs={obs} task={task} onDrawer={setDrawer} onTweaks={() => setTweaksOpen(t => !t)} status={status}/>
        <main className="main">
          <section className="col-left">
            <div className="panel">
              <PanelHead title="MISSION CONTROL"/>
              <div className="panel-body">
                <ControlBar
                  task={taskId} setTask={setTaskId}
                  seed={seed} setSeed={setSeed}
                  running={running} onRun={() => setRunning(r => !r)}
                  onStep={doStep} onReset={onReset}
                  onSuggest={onSuggest} onClear={onClear}
                  obs={obs} progress={progress}
                />
              </div>
            </div>
            <div className="panel" style={{ flex: 1 }}>
              <PanelHead title="RESOURCES"/>
              <div className="panel-body">
                <ResourcePanel obs={obs} task={task}/>
              </div>
            </div>
            <div className="panel">
              <PanelHead title="ZONE DETAIL"/>
              <div className="panel-body">
                <ZoneDetail zid={selected} obs={obs} weather={obs.weather}/>
              </div>
            </div>
          </section>

          <section className="col-center">
            <div className="panel" style={{ flex: 1 }}>
              <PanelHead title="TACTICAL MAP" counter={dispatchCount} tools={
                status === 'hot' ? <div className="alert alert-hot"><span className="alert-dot"/>CRITICAL</div>
                : status === 'warn' ? <div className="alert alert-warn"><span className="alert-dot"/>ELEVATED</div>
                : null
              }/>
              <div className="panel-body p-0">
                <TacticalMap obs={obs} task={task} selected={selected} onSelect={setSelected}/>
              </div>
            </div>
          </section>

          <section className="col-right">
            <div className="panel" style={{ flex: 1 }}>
              <PanelHead title="DISPATCH" counter={dispatchCount}/>
              <div className="panel-body">
                <DispatchPanel
                  obs={obs} task={task}
                  allocations={allocations} setAllocations={setAllocations}
                  selected={selected} onSelect={setSelected}
                  onSuggest={onSuggest} onClear={onClear}
                />
              </div>
            </div>
            <div className="panel">
              <PanelHead title="BROADCAST"/>
              <div className="panel-body">
                <Broadcast value={broadcast} onChange={setBroadcast} obs={obs}/>
              </div>
            </div>
          </section>

          <section className="row-bottom">
            <div className="panel">
              <PanelHead title="TIMELINE" counter={eventCount}/>
              <div className="panel-body p-0">
                <Timeline events={events}/>
              </div>
            </div>
            <div className="panel">
              <PanelHead title="REWARD TRAJECTORY"/>
              <div className="panel-body">
                <RewardPanel history={history} obs={obs} score={scoreComposite}/>
              </div>
            </div>
          </section>
        </main>
        <StatusBar obs={obs} task={task} score={scoreComposite}/>

        {settings.expertView && (
          <div className="assist-floating" style={{ position: 'fixed', bottom: 40, right: tweaksOpen ? 320 : 16, width: 340, maxHeight: 420, zIndex: 90, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <PanelHead title="TAC ASSISTANT"/>
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <Assistant obs={obs} task={task} score={scoreComposite}/>
            </div>
          </div>
        )}

        {drawer && <Drawer which={drawer} onClose={() => setDrawer(null)}/>}
        <Tweaks visible={tweaksOpen} settings={settings} setSettings={setSettings} onClose={() => setTweaksOpen(false)}/>

        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span className="toast-dot"/>{t.msg}
          </div>
        ))}

        {endResultKind && (
          <div className="end-card">
            <div className="card">
              <h2>EPISODE CLOSED</h2>
              <div className={`outcome ${endResultKind}`}>{endResultKind === 'win' ? 'MISSION COMPLETE' : 'EPISODE TRUNCATED'}</div>
              <div className="end-grid">
                <div className="cell"><div className="k">Cumulative R</div><div className="v">{obs.totalReward.toFixed(2)}</div></div>
                <div className="cell"><div className="k">Resolved</div><div className="v">{obs.resolved}/{obs.totalIncidents}</div></div>
                <div className="cell"><div className="k">Steps</div><div className="v">{obs.step}/{obs.maxSteps}</div></div>
                <div className="cell"><div className="k">Score</div><div className="v">{scoreComposite.toFixed(3)}</div></div>
              </div>
              <button className="btn-run" onClick={onReset}>RESTART EPISODE</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App/>);
})();

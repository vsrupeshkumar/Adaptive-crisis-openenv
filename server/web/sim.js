/* ============================================================
   sim.js — JS port of the Adaptive Crisis Management env
   Mirrors env/models.py + env/environment.py + env/tasks.py + env/reward.py
   Exposes: window.Sim
   ============================================================ */
(function () {
  'use strict';

  // ------- Enums / ranks -------
  const Fire = { NONE: 'none', LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CATASTROPHIC: 'catastrophic' };
  const Pat  = { NONE: 'none', MODERATE: 'moderate', CRITICAL: 'critical', FATAL: 'fatal' };
  const Traf = { LOW: 'low', HEAVY: 'heavy', GRIDLOCK: 'gridlock' };
  const Wx   = { CLEAR: 'clear', STORM: 'storm', HURRICANE: 'hurricane' };

  const FireRank = { none: 0, low: 1, medium: 2, high: 3, catastrophic: 4 };
  const PatRank  = { none: 0, moderate: 1, critical: 3, fatal: 5 };
  const TrafRank = { low: 0, heavy: 1, gridlock: 2 };

  // ------- PRNG (mulberry32) -------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  class Rng {
    constructor(seed) { this.reseed(seed); }
    reseed(seed) { this._r = mulberry32(seed || 42); }
    random() { return this._r(); }
    choice(arr) { return arr[Math.floor(this.random() * arr.length)]; }
    choices(arr, weights) {
      const sum = weights.reduce((a,b) => a+b, 0);
      let r = this.random() * sum;
      for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r <= 0) return arr[i]; }
      return arr[arr.length-1];
    }
  }

  // ------- Required resources (from reward.py) -------
  function requiredFire(fire, weather) {
    const base = { none: 0, low: 1, medium: 2, high: 4, catastrophic: 6 }[fire];
    if (base === 0) return 0;
    const mult = weather === Wx.HURRICANE ? 1.5 : weather === Wx.STORM ? 1.25 : 1.0;
    return Math.ceil(base * mult);
  }
  function requiredAmb(pat) {
    return { none: 0, moderate: 1, critical: 2, fatal: 0 }[pat];
  }

  // ------- Tasks -------
  const TASKS = {
    1: {
      id: 1, name: 'Single-Zone Emergency', level: 'easy',
      maxSteps: 12, weather: Wx.CLEAR,
      pool: { fire: 5, amb: 5, pol: 3 },
      coords: {
        Downtown:   { q: 0, r: 0 },
        Suburbs:    { q: 2, r: -1 },
        Industrial: { q: -2, r: 1 },
      },
      adjacency: { Downtown: ['Suburbs','Industrial'], Suburbs: ['Downtown'], Industrial: ['Downtown'] },
      initial(rng) {
        return {
          Downtown:   { fire: Fire.MEDIUM, patient: Pat.NONE, traffic: Traf.LOW },
          Suburbs:    { fire: Fire.NONE, patient: Pat.NONE, traffic: rng.random() < 0.3 ? Traf.HEAVY : Traf.LOW },
          Industrial: { fire: Fire.NONE, patient: Pat.NONE, traffic: Traf.LOW },
        };
      }
    },
    2: {
      id: 2, name: 'Multi-Zone Weather Chaos', level: 'medium',
      maxSteps: 15, weather: Wx.STORM,
      pool: { fire: 5, amb: 3, pol: 2 },
      coords: {
        Downtown:   { q: 0, r: 0 },
        Suburbs:    { q: 2, r: -1 },
        Industrial: { q: -2, r: 1 },
      },
      adjacency: { Downtown: ['Suburbs','Industrial'], Suburbs: ['Downtown'], Industrial: ['Downtown'] },
      initial(rng) {
        const suburbsFire = rng.choices([Fire.MEDIUM, Fire.HIGH], [0.5, 0.5]);
        const downPat = rng.choices([Pat.MODERATE, Pat.CRITICAL], [0.6, 0.4]);
        return {
          Downtown:   { fire: Fire.NONE, patient: downPat, traffic: Traf.HEAVY },
          Suburbs:    { fire: suburbsFire, patient: Pat.NONE, traffic: Traf.LOW },
          Industrial: { fire: Fire.NONE, patient: Pat.NONE, traffic: Traf.LOW },
        };
      }
    },
    3: {
      id: 3, name: 'City-Wide Meta Triage', level: 'hard',
      maxSteps: 25, weather: Wx.HURRICANE,
      pool: { fire: 6, amb: 3, pol: 2 },
      coords: {
        Downtown:    { q: 0, r: 0 },
        Suburbs:     { q: 2, r: -1 },
        Industrial:  { q: -1, r: -1 },
        Harbor:      { q: -2, r: 1 },
        Residential: { q: 1, r: 1 },
      },
      adjacency: {
        Downtown: ['Suburbs','Residential'],
        Suburbs: ['Downtown','Industrial'],
        Industrial: ['Suburbs','Harbor'],
        Harbor: ['Industrial','Residential'],
        Residential: ['Harbor','Downtown'],
      },
      initial(rng) {
        const dtFire = rng.choices([Fire.HIGH, Fire.CATASTROPHIC], [0.6, 0.4]);
        const subPat = rng.choices([Pat.CRITICAL, Pat.MODERATE], [0.7, 0.3]);
        const harborFire = rng.choices([Fire.LOW, Fire.MEDIUM], [0.5, 0.5]);
        const resPat = rng.choices([Pat.MODERATE, Pat.NONE], [0.6, 0.4]);
        return {
          Downtown:    { fire: dtFire, patient: Pat.NONE, traffic: Traf.GRIDLOCK },
          Suburbs:     { fire: Fire.NONE, patient: subPat, traffic: Traf.GRIDLOCK },
          Industrial:  { fire: Fire.CATASTROPHIC, patient: Pat.NONE, traffic: Traf.LOW },
          Harbor:      { fire: harborFire, patient: Pat.NONE, traffic: Traf.HEAVY },
          Residential: { fire: Fire.NONE, patient: resPat, traffic: Traf.LOW },
        };
      }
    }
  };

  // ------- Severity escalation -------
  const FIRE_UP = { low: Fire.MEDIUM, medium: Fire.HIGH, high: Fire.CATASTROPHIC };
  const PAT_UP  = { moderate: Pat.CRITICAL, critical: Pat.FATAL };

  function escalateZone(z) {
    if (FIRE_UP[z.fire]) z.fire = FIRE_UP[z.fire];
    if (PAT_UP[z.patient]) z.patient = PAT_UP[z.patient];
    if (z.traffic === Traf.HEAVY) z.traffic = Traf.GRIDLOCK;
  }

  function countIncidents(zones) {
    let n = 0;
    for (const z of Object.values(zones)) {
      if (z.fire !== Fire.NONE) n++;
      if (z.patient !== Pat.NONE && z.patient !== Pat.FATAL) n++;
      if (z.traffic === Traf.HEAVY || z.traffic === Traf.GRIDLOCK) n++;
    }
    return n;
  }

  // ------- Environment -------
  class CrisisEnv {
    constructor(taskId, seed) {
      this.taskId = taskId;
      this.seed = seed;
      this.reset(seed);
    }
    reset(seed) {
      if (seed != null) this.seed = seed;
      this.task = TASKS[this.taskId];
      this.rng = new Rng(this.seed);

      const zones = this.task.initial(this.rng);
      this.zones = zones;
      this.weather = this.task.weather;
      this.idle = { ...this.task.pool };
      this.busy = { fire: 0, amb: 0, pol: 0 };
      this.deployments = [];  // {zone, fire, amb, pol, steps, status}
      this.step = 0;
      this.maxSteps = this.task.maxSteps;
      this.totalReward = 0;
      this.wasted = 0;
      this.resolved = 0;
      this.totalIncidents = countIncidents(this.zones);
      this.rewardHistory = [];
      this.zoneFailures = Object.fromEntries(Object.keys(zones).map(k => [k, 0]));
      this.terminated = false;
      this.truncated = false;
      this.isDone = false;
      this.events = [];
      this.emit('reset', `Task ${this.taskId} — ${this.task.name}. Seed ${this.seed}. ${this.totalIncidents} active incidents.`);
      return this.observation();
    }
    observation() {
      return {
        weather: this.weather,
        zones: JSON.parse(JSON.stringify(this.zones)),
        idle: { ...this.idle },
        busy: { ...this.busy },
        deployments: JSON.parse(JSON.stringify(this.deployments)),
        step: this.step,
        maxSteps: this.maxSteps,
        totalReward: this.totalReward,
        resolved: this.resolved,
        totalIncidents: this.totalIncidents,
        isDone: this.isDone,
        success: this.resolved >= this.totalIncidents && this.totalIncidents > 0,
      };
    }
    emit(kind, msg, meta) {
      const e = { id: Date.now() + Math.random(), step: this.step, kind, msg, meta };
      this.events.push(e);
    }

    // --- Advance deployment timers ---
    _tick() {
      const still = [];
      let recF = 0, recA = 0, recP = 0;
      for (const d of this.deployments) {
        d.steps -= 1;
        if (d.steps <= 0) { d.status = 'IDLE'; recF += d.fire; recA += d.amb; recP += d.pol; }
        else { d.status = 'BUSY'; still.push(d); }
      }
      if (recF + recA + recP > 0) {
        this.idle.fire += recF; this.idle.amb += recA; this.idle.pol += recP;
        this.busy.fire -= recF; this.busy.amb -= recA; this.busy.pol -= recP;
        if (recF+recA+recP) this.emit('reward', `Recovered ${recF}F / ${recA}A / ${recP}P to idle pool.`);
      }
      this.deployments = still;
    }

    _cooldown(zone) {
      const fireSev = FireRank[zone.fire] || 0;
      const patSev = ({ none:0, moderate:1, critical:3, fatal:5 })[zone.patient] || 0;
      const trafSev = TrafRank[zone.traffic] || 0;
      const severity = Math.max(1, fireSev, patSev, trafSev);
      const wMult = this.weather === Wx.HURRICANE ? 2.0 : this.weather === Wx.STORM ? 1.5 : 1.0;
      return Math.ceil((2 + severity) * wMult);
    }

    act(allocations) {
      if (this.isDone) return { reward: 0, info: { error: 'episode done' } };

      // Inventory breach check
      let reqF = 0, reqA = 0, reqP = 0;
      for (const z of Object.keys(this.zones)) {
        const d = allocations[z] || {};
        reqF += d.fire || 0; reqA += d.amb || 0; reqP += (d.pol ? 1 : 0);
      }
      if (reqF > this.idle.fire || reqA > this.idle.amb || reqP > this.idle.pol) {
        const pen = -15.0;
        this.totalReward += pen;
        this.step += 1;
        this.rewardHistory.push({ step: this.step, reward: pen, base: pen, nlp: 0, waste: 0 });
        this.emit('breach', `INVENTORY BREACH — requested ${reqF}F/${reqA}A/${reqP}P; have ${this.idle.fire}F/${this.idle.amb}A/${this.idle.pol}P. Action voided. -15.0`);
        if (this.step >= this.maxSteps) { this.isDone = true; this.truncated = true; }
        return { reward: pen, info: { breach: true } };
      }

      this.step += 1;
      const prev = JSON.parse(JSON.stringify(this.zones));
      this._tick();

      let base = 0, waste = 0;

      for (const zid of Object.keys(this.zones)) {
        const z = this.zones[zid];
        const d = allocations[zid] || { fire: 0, amb: 0, pol: false };
        const preFire = z.fire, prePat = z.patient, preTraf = z.traffic;

        const reqf = requiredFire(preFire, this.weather);
        const reqa = requiredAmb(prePat);
        const needTraf = preTraf === Traf.HEAVY || preTraf === Traf.GRIDLOCK;
        const hasActive = reqf > 0 || reqa > 0 || needTraf;
        const zeroDisp = !d.fire && !d.amb && !d.pol;

        if (hasActive && zeroDisp) {
          base -= 4;
          if (preFire === Fire.HIGH || preFire === Fire.CATASTROPHIC || prePat === Pat.CRITICAL) base -= 5;
          this.zoneFailures[zid] = (this.zoneFailures[zid] || 0) + 1;
          if (this.zoneFailures[zid] >= 2) {
            escalateZone(z);
            this.zoneFailures[zid] = 0;
            this.emit('cascade', `${zid.toUpperCase()} escalated due to neglect.`);
          }
          continue;
        }

        // Commit allocation
        const uf = d.fire || 0, ua = d.amb || 0, up = d.pol ? 1 : 0;
        this.idle.fire -= uf; this.idle.amb -= ua; this.idle.pol -= up;
        this.busy.fire += uf; this.busy.amb += ua; this.busy.pol += up;
        if (uf+ua+up > 0) {
          this.deployments.push({ zone: zid, fire: uf, amb: ua, pol: up, steps: this._cooldown(z), status: 'DISPATCHED' });
          this.emit('dispatch', `${zid.toUpperCase()}: dispatched ${uf}F / ${ua}A / ${up}P.`);
        }

        // Resolution check
        let sufficient = true;
        if (reqf > 0 && uf < reqf) sufficient = false;
        if (reqa > 0) {
          const glMod = preTraf === Traf.GRIDLOCK && !up ? 1 : 0;
          if (ua < reqa + glMod) sufficient = false;
        }
        if (needTraf && !up) sufficient = false;

        if (sufficient && hasActive) {
          if (uf > 0 && preFire !== Fire.NONE) { z.fire = Fire.NONE; this.resolved++; base += 6; this.emit('resolve', `${zid.toUpperCase()}: fire CONTAINED.`); }
          if (ua > 0 && prePat !== Pat.NONE && prePat !== Pat.FATAL) { z.patient = Pat.NONE; this.resolved++; base += 6; this.emit('resolve', `${zid.toUpperCase()}: casualties STABILIZED.`); }
          if (up > 0 && needTraf) { z.traffic = Traf.LOW; this.resolved++; base += 3; this.emit('resolve', `${zid.toUpperCase()}: traffic CLEARED.`); }
          this.zoneFailures[zid] = 0;
          base += 2; // stabilization bonus
        } else if (!sufficient && hasActive) {
          base -= 2;
          this.zoneFailures[zid] = (this.zoneFailures[zid] || 0) + 1;
          if (this.zoneFailures[zid] >= 3) {
            escalateZone(z);
            this.zoneFailures[zid] = 0;
            this.emit('cascade', `${zid.toUpperCase()}: insufficient response — hazard ESCALATED.`);
          }
        }

        // Waste accounting (severity-weighted)
        const fExcess = Math.max(0, uf - reqf);
        const aExcess = Math.max(0, ua - reqa);
        if (fExcess > 0) {
          const w = (preFire === Fire.HIGH || preFire === Fire.CATASTROPHIC) ? 0.5 : preFire === Fire.MEDIUM ? 1.0 : 2.0;
          waste += fExcess * w;
        }
        if (aExcess > 0) {
          const w = prePat === Pat.CRITICAL ? 0.5 : prePat === Pat.MODERATE ? 1.0 : 2.0;
          waste += aExcess * w;
        }
      }
      this.wasted += waste;

      // Hard-mode mechanics
      if (this.taskId === 3) this._hardMode();

      // Check termination
      const allClear = Object.values(this.zones).every(z =>
        z.fire === Fire.NONE && (z.patient === Pat.NONE || z.patient === Pat.FATAL) && z.traffic === Traf.LOW
      );
      if (allClear) { this.terminated = true; this.isDone = true; this.emit('win', `All incidents resolved. Mission complete.`); }
      else if (this.step >= this.maxSteps) { this.truncated = true; this.isDone = true; this.emit('fail', `Step limit reached. Episode truncated.`); }

      const stepReward = base - waste;
      this.totalReward += stepReward;
      this.rewardHistory.push({ step: this.step, reward: stepReward, base, nlp: 0, waste });

      return { reward: stepReward, info: { base, waste, resolved: this.resolved, total: this.totalIncidents } };
    }

    _hardMode() {
      // Cascading (fires spread from HIGH/CATA to neighbors)
      const adj = this.task.adjacency;
      const snapshot = {};
      for (const [k,z] of Object.entries(this.zones)) snapshot[k] = FireRank[z.fire] || 0;
      for (const [zid, sev] of Object.entries(snapshot)) {
        if (sev <= 3) continue;
        const p = 0.4 * (sev - 3) / 1;
        for (const nb of (adj[zid] || [])) {
          const nbSev = snapshot[nb] || 0;
          if (nbSev >= sev) continue;
          if (this.rng.random() < p) {
            escalateZone(this.zones[nb]);
            if (nbSev === 0 && this.zones[nb].fire !== Fire.NONE) this.totalIncidents++;
            this.emit('cascade', `CASCADE — fire spread from ${zid.toUpperCase()} to ${nb.toUpperCase()}.`);
          }
        }
      }
      // Depletion every 4 steps
      if (this.step > 0 && this.step % 4 === 0 && this.idle.fire > 0) {
        this.idle.fire -= 1;
        this.emit('deplete', `Resource depletion — fire pool reduced to ${this.idle.fire}.`);
      }
      // NHPP disaster spawn
      const chaos = this.step / Math.max(1, this.maxSteps);
      const lambda = 0.02 * Math.exp(2.5 * chaos);
      const pSpawn = 1 - Math.exp(-lambda);
      for (const [zid, z] of Object.entries(this.zones)) {
        const clear = z.fire === Fire.NONE && (z.patient === Pat.NONE || z.patient === Pat.FATAL);
        if (!clear) continue;
        if (this.rng.random() < pSpawn) {
          const isFire = this.rng.random() < 0.5;
          if (isFire) {
            const sev = this.rng.choice([Fire.LOW, Fire.MEDIUM, Fire.HIGH]);
            this.zones[zid].fire = sev;
            this.totalIncidents++;
            this.emit('spawn', `NHPP SPAWN — ${sev.toUpperCase()} fire erupted in ${zid.toUpperCase()}.`);
          } else {
            const sev = this.rng.choice([Pat.MODERATE, Pat.CRITICAL]);
            this.zones[zid].patient = sev;
            this.totalIncidents++;
            this.emit('spawn', `NHPP SPAWN — ${sev.toUpperCase()} medical event in ${zid.toUpperCase()}.`);
          }
        }
      }
    }

    // Suggest dispatch: greedy, mirrors what an oracle would do given idle pool
    suggest() {
      const allocs = {};
      let remF = this.idle.fire, remA = this.idle.amb, remP = this.idle.pol;
      // Sort zones by severity desc
      const entries = Object.entries(this.zones).map(([zid, z]) => {
        const sev = Math.max(FireRank[z.fire], PatRank[z.patient] >= 3 ? 3 : PatRank[z.patient]);
        return { zid, z, sev };
      }).sort((a,b) => b.sev - a.sev);
      for (const { zid, z } of entries) {
        const reqf = requiredFire(z.fire, this.weather);
        const reqa = requiredAmb(z.patient);
        const needTraf = z.traffic === Traf.HEAVY || z.traffic === Traf.GRIDLOCK;
        const uf = Math.min(remF, reqf);
        const ua = Math.min(remA, reqa + (z.traffic === Traf.GRIDLOCK ? 1 : 0));
        const up = needTraf && remP > 0 ? 1 : 0;
        if (uf + ua + up > 0) {
          allocs[zid] = { fire: uf, amb: ua, pol: !!up };
          remF -= uf; remA -= ua; remP -= up;
        }
      }
      return allocs;
    }
  }

  window.Sim = {
    CrisisEnv, TASKS,
    Fire, Pat, Traf, Wx,
    FireRank, PatRank, TrafRank,
    requiredFire, requiredAmb, countIncidents,
  };
})();

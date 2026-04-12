/**
 * Crisis Management Dashboard — Client-Side Application
 * =====================================================
 * Pure ES6 module-pattern application (no frameworks, no external deps).
 *
 * Architecture:
 *   CrisisClient    — Async HTTP API wrapper (fetch-based, never throws)
 *   HeatmapRenderer — Zone severity visualization with CSS class mapping
 *   GaugeRenderer   — Resource pool horizontal bar gauges
 *   SparklineRenderer — Canvas 2D reward trajectory chart
 *   DispatchPanel   — Manual per-zone dispatch slider interface
 *   ActionLog       — Scrolling event log with color-coded entries
 *
 * State: Module-scoped variables (no external state library).
 * DOM:   All updates via getElementById + textContent/innerHTML.
 */

(function () {
    'use strict';

    // =========================================================================
    // Module State
    // =========================================================================
    let currentObs = null;
    let stepCount = 0;
    let rewards = [];
    let selectedTask = 1;
    let sessionActive = false;
    let episodeDone = false;
    let lastScore = 0;
    let lastEfficiency = 0;

    // =========================================================================
    // 1. CrisisClient — HTTP API Wrapper
    // =========================================================================
    const CrisisClient = {
        /** POST /reset — returns observation dict or {error}. */
        async reset(taskId, seed) {
            try {
                const body = { task_id: taskId };
                if (seed !== null && seed !== undefined && seed !== '') {
                    body.seed = parseInt(seed, 10);
                }
                const res = await fetch('/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!res.ok) {
                    const err = await res.text();
                    return { error: `HTTP ${res.status}: ${err}` };
                }
                return await res.json();
            } catch (e) {
                return { error: e.message };
            }
        },

        /** POST /step — returns {observation, reward, done, info} or {error}. */
        async step(allocations, broadcastMessage) {
            try {
                const body = { allocations };
                if (broadcastMessage && broadcastMessage.trim()) {
                    body.public_broadcast_message = broadcastMessage.trim();
                }
                const res = await fetch('/step', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!res.ok) {
                    const err = await res.text();
                    return { error: `HTTP ${res.status}: ${err}` };
                }
                return await res.json();
            } catch (e) {
                return { error: e.message };
            }
        },

        /** GET /health — returns health payload or {error}. */
        async getHealth() {
            try {
                const res = await fetch('/health');
                if (!res.ok) return { error: `HTTP ${res.status}` };
                return await res.json();
            } catch (e) {
                return { error: e.message };
            }
        },

        /** GET /state — returns full environment state or {error}. */
        async getState() {
            try {
                const res = await fetch('/state');
                if (!res.ok) return { error: `HTTP ${res.status}` };
                return await res.json();
            } catch (e) {
                return { error: e.message };
            }
        }
    };

    // =========================================================================
    // 2. HeatmapRenderer — Zone Severity Visualization
    // =========================================================================
    const HeatmapRenderer = {
        /** Compute the maximum severity class for a zone based on all hazards. */
        _maxSeverity(zone) {
            const fireRank = { none: 0, low: 1, medium: 2, high: 3, catastrophic: 4 };
            const patientRank = { none: 0, moderate: 1, critical: 3, fatal: 4 };
            const trafficRank = { low: 0, heavy: 1, gridlock: 2 };

            const f = fireRank[zone.fire] || 0;
            const p = patientRank[zone.patient] || 0;
            const t = trafficRank[zone.traffic] || 0;
            const maxR = Math.max(f, p, t);

            if (maxR === 0) return 'none';
            if (maxR === 1) return 'low';
            if (maxR === 2) return 'medium';
            if (maxR === 3) return 'high';
            return 'catastrophic';
        },

        /** Build hazard indicator strings for a zone. */
        _indicators(zone) {
            const parts = [];
            if (zone.fire && zone.fire !== 'none') {
                parts.push(`<span class="zone-indicator"><span class="emoji">🔥</span> ${zone.fire}</span>`);
            }
            if (zone.patient && zone.patient !== 'none') {
                const emoji = zone.patient === 'fatal' ? '💀' : '🏥';
                parts.push(`<span class="zone-indicator"><span class="emoji">${emoji}</span> ${zone.patient}</span>`);
            }
            if (zone.traffic && zone.traffic !== 'low') {
                parts.push(`<span class="zone-indicator"><span class="emoji">🚗</span> ${zone.traffic}</span>`);
            }
            if (parts.length === 0) {
                parts.push(`<span class="zone-indicator" style="color:var(--severity-none)">✓ Clear</span>`);
            }
            return parts.join('');
        },

        /** Render all zones into the grid. */
        render(zones) {
            const grid = document.getElementById('zone-grid');
            if (!zones || Object.keys(zones).length === 0) {
                grid.innerHTML = '<div class="zone-placeholder">No zone data</div>';
                return;
            }

            grid.innerHTML = '';
            for (const [zoneId, zoneState] of Object.entries(zones)) {
                const sev = this._maxSeverity(zoneState);
                const card = document.createElement('div');
                card.className = `zone-card sev-${sev}`;
                card.id = `zone-${zoneId.toLowerCase().replace(/\s+/g, '-')}`;
                card.innerHTML = `
                    <div class="zone-name">${zoneId}</div>
                    <div class="zone-indicators">${this._indicators(zoneState)}</div>
                `;
                grid.appendChild(card);
            }
        }
    };

    // =========================================================================
    // 3. GaugeRenderer — Resource Pool Visualization
    // =========================================================================
    const GaugeRenderer = {
        render(idle, busy) {
            if (!idle || !busy) return;

            this._updateGauge('fire', idle.fire_units, busy.fire_units);
            this._updateGauge('amb', idle.ambulances, busy.ambulances);
            this._updateGauge('pol', idle.police, busy.police);
        },

        _updateGauge(type, idleCount, busyCount) {
            const total = idleCount + busyCount;
            const pct = total > 0 ? (idleCount / total) * 100 : 0;

            const fill = document.getElementById(`gauge-${type}`);
            const idleEl = document.getElementById(`${type}-idle`);
            const busyEl = document.getElementById(`${type}-busy`);

            if (fill) fill.style.width = `${pct}%`;
            if (idleEl) idleEl.textContent = idleCount;
            if (busyEl) busyEl.textContent = busyCount;
        }
    };

    // =========================================================================
    // 4. SparklineRenderer — Reward History Chart (Canvas 2D)
    // =========================================================================
    const SparklineRenderer = {
        render(rewardsArr) {
            const canvas = document.getElementById('reward-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            // Handle high-DPI displays
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * (window.devicePixelRatio || 1);
            canvas.height = rect.height * (window.devicePixelRatio || 1);
            ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
            const W = rect.width;
            const H = rect.height;

            // Clear
            ctx.clearRect(0, 0, W, H);

            if (rewardsArr.length === 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.font = '12px sans-serif';
                ctx.fillText('No data yet', W / 2 - 30, H / 2);
                return;
            }

            const padding = { top: 12, bottom: 12, left: 12, right: 12 };
            const plotW = W - padding.left - padding.right;
            const plotH = H - padding.top - padding.bottom;

            const minR = Math.min(0, ...rewardsArr);
            const maxR = Math.max(0, ...rewardsArr);
            const range = maxR - minR || 1;

            // Zero line
            const zeroY = padding.top + plotH * (1 - (0 - minR) / range);
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(padding.left, zeroY);
            ctx.lineTo(W - padding.right, zeroY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Plot segments (green for positive, red for negative)
            const xStep = rewardsArr.length > 1 ? plotW / (rewardsArr.length - 1) : plotW;

            for (let i = 1; i < rewardsArr.length; i++) {
                const x0 = padding.left + (i - 1) * xStep;
                const x1 = padding.left + i * xStep;
                const y0 = padding.top + plotH * (1 - (rewardsArr[i - 1] - minR) / range);
                const y1 = padding.top + plotH * (1 - (rewardsArr[i] - minR) / range);

                const color = rewardsArr[i] >= 0 ? '#22c55e' : '#ef4444';
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.stroke();
            }

            // Dots
            for (let i = 0; i < rewardsArr.length; i++) {
                const x = padding.left + i * xStep;
                const y = padding.top + plotH * (1 - (rewardsArr[i] - minR) / range);
                const c = rewardsArr[i] >= 0 ? '#22c55e' : '#ef4444';

                ctx.fillStyle = c;
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    };

    // =========================================================================
    // 5. DispatchPanel — Manual Dispatch Interface
    // =========================================================================
    const DispatchPanel = {
        /** Render slider controls for each zone. */
        render(zones, idle) {
            const container = document.getElementById('dispatch-zones');
            if (!zones) {
                container.innerHTML = '<div class="zone-placeholder">No zones</div>';
                return;
            }

            container.innerHTML = '';
            const maxFire = idle ? idle.fire_units : 10;
            const maxAmb = idle ? idle.ambulances : 10;

            for (const zoneId of Object.keys(zones)) {
                const safeId = zoneId.toLowerCase().replace(/\s+/g, '-');
                const row = document.createElement('div');
                row.className = 'dispatch-zone-row';
                row.innerHTML = `
                    <div class="dz-label">${zoneId}</div>
                    <div class="dz-slider-group">
                        <div class="dz-slider-label">
                            <span>🚒 Fire</span>
                            <span id="val-fire-${safeId}">0</span>
                        </div>
                        <input type="range" class="dz-slider fire-slider"
                               id="slider-fire-${safeId}" data-zone="${zoneId}" data-type="fire"
                               min="0" max="${maxFire}" value="0">
                    </div>
                    <div class="dz-slider-group">
                        <div class="dz-slider-label">
                            <span>🏥 Amb</span>
                            <span id="val-amb-${safeId}">0</span>
                        </div>
                        <input type="range" class="dz-slider amb-slider"
                               id="slider-amb-${safeId}" data-zone="${zoneId}" data-type="amb"
                               min="0" max="${maxAmb}" value="0">
                    </div>
                    <div class="dz-checkbox-group">
                        <input type="checkbox" class="dz-checkbox"
                               id="chk-traffic-${safeId}" data-zone="${zoneId}">
                        <label for="chk-traffic-${safeId}">🚔</label>
                    </div>
                `;
                container.appendChild(row);
            }

            // Bind slider value displays
            container.querySelectorAll('.dz-slider').forEach(slider => {
                slider.addEventListener('input', () => {
                    const zone = slider.dataset.zone.toLowerCase().replace(/\s+/g, '-');
                    const type = slider.dataset.type;
                    const valEl = document.getElementById(`val-${type}-${zone}`);
                    if (valEl) valEl.textContent = slider.value;
                });
            });
        },

        /** Read current slider/checkbox values into an allocations dict. */
        readAllocations() {
            const allocations = {};
            const container = document.getElementById('dispatch-zones');
            if (!container) return allocations;

            const sliders = container.querySelectorAll('.dz-slider');
            const checkboxes = container.querySelectorAll('.dz-checkbox');

            // Accumulate by zone
            sliders.forEach(s => {
                const zone = s.dataset.zone;
                if (!allocations[zone]) {
                    allocations[zone] = { dispatch_fire: 0, dispatch_ambulance: 0, control_traffic: false };
                }
                if (s.dataset.type === 'fire') {
                    allocations[zone].dispatch_fire = parseInt(s.value, 10);
                } else if (s.dataset.type === 'amb') {
                    allocations[zone].dispatch_ambulance = parseInt(s.value, 10);
                }
            });

            checkboxes.forEach(c => {
                const zone = c.dataset.zone;
                if (!allocations[zone]) {
                    allocations[zone] = { dispatch_fire: 0, dispatch_ambulance: 0, control_traffic: false };
                }
                allocations[zone].control_traffic = c.checked;
            });

            return allocations;
        },

        /** Update slider maximums when idle resources change. */
        updateMaximums(idle) {
            if (!idle) return;
            document.querySelectorAll('.dz-slider.fire-slider').forEach(s => {
                s.max = idle.fire_units;
                if (parseInt(s.value) > idle.fire_units) s.value = idle.fire_units;
            });
            document.querySelectorAll('.dz-slider.amb-slider').forEach(s => {
                s.max = idle.ambulances;
                if (parseInt(s.value) > idle.ambulances) s.value = idle.ambulances;
            });
        }
    };

    // =========================================================================
    // 6. ActionLog — Scrolling Event Log
    // =========================================================================
    const ActionLog = {
        _container: null,

        init() {
            this._container = document.getElementById('log-container');
        },

        append(message, type = 'info') {
            if (!this._container) this.init();
            const entry = document.createElement('div');
            entry.className = `log-entry log-${type}`;
            entry.textContent = message;
            this._container.appendChild(entry);
            // Auto-scroll to bottom
            this._container.scrollTop = this._container.scrollHeight;
        },

        clear() {
            if (!this._container) this.init();
            this._container.innerHTML = '';
        }
    };

    // =========================================================================
    // Weather emoji helper
    // =========================================================================
    function weatherEmoji(w) {
        if (!w) return '—';
        const map = { clear: '☀️ Clear', storm: '⛈️ Storm', hurricane: '🌀 Hurricane' };
        return map[w] || w;
    }

    // =========================================================================
    // UI State Updates
    // =========================================================================
    function updateSessionInfo(obs, score, efficiency) {
        document.getElementById('weather-display').textContent = weatherEmoji(obs.weather);
        document.getElementById('score-display').textContent = score.toFixed(3);
        document.getElementById('spark-score').textContent = score.toFixed(3);
        document.getElementById('spark-efficiency').textContent = efficiency.toFixed(3);

        const cumR = rewards.reduce((a, b) => a + b, 0);
        document.getElementById('cumulative-reward').textContent = cumR.toFixed(2);

        const maxSteps = selectedTask === 1 ? 10 : selectedTask === 2 ? 15 : 25;
        document.getElementById('step-counter').textContent = `${stepCount} / ${maxSteps}`;
    }

    function setStatus(status) {
        const el = document.getElementById('status-indicator');
        el.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        el.className = `info-value status-${status}`;
    }

    // =========================================================================
    // Event Handlers
    // =========================================================================

    /** RESET — initialize fresh episode */
    async function handleReset() {
        const seed = document.getElementById('seed-input').value;
        const btnReset = document.getElementById('btn-reset');
        const btnStep = document.getElementById('btn-step');

        btnReset.disabled = true;
        setStatus('active');
        ActionLog.clear();
        ActionLog.append(`Resetting environment: Task=${selectedTask}, Seed=${seed || 'random'}`, 'system');

        const result = await CrisisClient.reset(selectedTask, seed);

        if (result.error) {
            ActionLog.append(`ERROR: ${result.error}`, 'error');
            setStatus('error');
            btnReset.disabled = false;
            return;
        }

        // Parse observation
        currentObs = result;
        stepCount = 0;
        rewards = [];
        sessionActive = true;
        episodeDone = false;
        lastScore = 0;
        lastEfficiency = 0;

        // Render all components
        HeatmapRenderer.render(currentObs.zones);
        GaugeRenderer.render(currentObs.idle_resources, currentObs.busy_resources);
        DispatchPanel.render(currentObs.zones, currentObs.idle_resources);
        SparklineRenderer.render(rewards);
        updateSessionInfo(currentObs, 0, 0);

        ActionLog.append(`Environment ready. ${Object.keys(currentObs.zones).length} zones active. Weather: ${currentObs.weather}`, 'info');

        btnReset.disabled = false;
        btnStep.disabled = false;

        document.getElementById('spark-last-reward').textContent = '—';
    }

    /** STEP — send dispatch and process response */
    async function handleStep() {
        if (!sessionActive || episodeDone) return;

        const btnStep = document.getElementById('btn-step');
        btnStep.disabled = true;

        const allocations = DispatchPanel.readAllocations();
        const broadcastMsg = document.getElementById('broadcast-input').value;

        // Summarize dispatch for log
        const dispSummary = Object.entries(allocations)
            .map(([z, d]) => `${z}:F${d.dispatch_fire}/A${d.dispatch_ambulance}${d.control_traffic ? '/P' : ''}`)
            .join(' ');
        ActionLog.append(`[Step ${stepCount + 1}] Dispatching: ${dispSummary}`, 'info');

        const result = await CrisisClient.step(allocations, broadcastMsg);

        if (result.error) {
            ActionLog.append(`ERROR: ${result.error}`, 'error');
            btnStep.disabled = false;
            return;
        }

        // Process step response
        stepCount++;
        const reward = result.reward;
        rewards.push(reward);

        currentObs = result.observation;
        const info = result.info || {};
        lastScore = info.score || lastScore;
        lastEfficiency = info.efficiency || lastEfficiency;

        // Update all renderers
        HeatmapRenderer.render(currentObs.zones);
        GaugeRenderer.render(currentObs.idle_resources, currentObs.busy_resources);
        DispatchPanel.updateMaximums(currentObs.idle_resources);
        SparklineRenderer.render(rewards);
        updateSessionInfo(currentObs, lastScore, lastEfficiency);

        document.getElementById('spark-last-reward').textContent = reward.toFixed(2);

        const rewardType = reward >= 0 ? 'positive' : 'negative';
        ActionLog.append(
            `[Step ${stepCount}] reward=${reward.toFixed(2)} | score=${lastScore.toFixed(3)} | done=${result.done}`,
            rewardType
        );

        if (result.done) {
            episodeDone = true;
            setStatus('done');
            ActionLog.append(
                `Episode complete. Final score: ${lastScore.toFixed(3)} | Steps: ${stepCount}`,
                'system'
            );
            btnStep.disabled = true;
        } else {
            btnStep.disabled = false;
        }
    }

    // =========================================================================
    // Initialization
    // =========================================================================
    function init() {
        ActionLog.init();

        // Task selector
        document.querySelectorAll('.btn-task').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-task').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedTask = parseInt(btn.dataset.task, 10);
            });
        });

        // Reset button
        document.getElementById('btn-reset').addEventListener('click', handleReset);

        // Step button
        document.getElementById('btn-step').addEventListener('click', handleStep);

        // Initial health check
        CrisisClient.getHealth().then(health => {
            if (health.error) {
                ActionLog.append(`Server health check failed: ${health.error}`, 'error');
                setStatus('error');
            } else {
                ActionLog.append(
                    `Server online. Sessions: ${health.active_sessions}/${health.max_sessions} | Memory: ${health.memory_rss_mb}MB`,
                    'info'
                );
            }
        });
    }

    // Boot when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

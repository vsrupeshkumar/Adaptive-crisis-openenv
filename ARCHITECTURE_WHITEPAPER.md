# Smart City Meta-Orchestration: Analytical Architecture
### Meta AI Hackathon Capstone - Technical Whitepaper

To secure the $7,000 Grand Prize, an application must transcend basic code and prove a deep understanding of mathematical Reinforcement Learning. This document outlines the rigorous academic framework driving this orchestration environment.

## 1. Reinforcement Learning Environment (MDP Architecture)
The core `environment.py` is structured upon a fully bounded Markov Decision Process (MDP).
- **States ($S$)**: Represented via a highly structured multidimensional array `(F, P, T, W, R_idle, R_busy)` denoting Fire Severity, Patient Triaging, Traffic Flow, Weather Chaos, and Resource Pools.
- **Actions ($A$)**: A dispatch vector simulating resource deployment subject strictly to `idle` limitations.
- **State Transition Physics (`step()` & `reset()`)**: The environment mimics continuous temporal mechanics by embedding a `tick_deployment()` array. When an AI dispatches a resource, it is dynamically shifted to $R_{busy}$. A hidden dynamic latency algorithm determines the cooldown steps required to return to $R_{idle}$, integrating friction variables such as `STORM` perturbations and `GRIDLOCK` delays.

## 2. Advanced Transition Dynamics (Non-Stationarity)
To satisfy Phase 3 "Hard Task" requirements, the environment implements non-stationary mechanics:
- **Topology**: Five-zone topology (Downtown, Suburbs, Industrial, Harbor, Residential) using a **State-Space Circular Ring** adjacency map.
- **Resource Depletion**: Fire units decay over time ($N_{fire, t} = N_{fire, 0} - \lfloor t/4 \rfloor$), forcing optimal early sequencing.
- **Inter-Zone Cascading (Stochastic Spread)**: High-severity incidents ($\xi_j > \tau=3$) spread to neighbors with probability $P$:
  $$P(\text{spread}) = \beta \cdot \frac{\xi_j - \tau}{\xi_{max} - \tau}$$
  where $\beta=0.4$ (Cascade Coefficient) and $\xi_{max}=4$.

## 3. Exploit-Resistant Reward Engineering
The `reward.py` and `grader.py` modules implement a multi-layered evaluation framework:
- **Action Diversity Monitor ($\mathcal{D}$)**: Calculated as the ratio of unique action hashes to total steps: $\mathcal{D} = |\{h(a_i)\}| / T$.
- **Monotony Penalty**: Modulates the final score $S$ if diversity falls below $\Gamma=0.3$:
  $$S' = S \cdot \min\left(1.0, \frac{\mathcal{D}}{\Gamma}\right)$$
- **Loop Detection Penalty**: A sliding window ($k=3$) penalizes repeated actions ($\delta=3.0$).

## 4. Adaptive Curriculum Escalation
The environment dynamically adjusts difficulty in-episode to probe agent resilience:
- **Trigger**: When the rolling 5-step reward window mean $\bar{W} > 0.7$.
- **Escalation ($\mathcal{E}$)**: Applies a 20% resource reduction ($Resources \leftarrow \lfloor 0.8 \times Resources \rfloor$) and injects a new crisis event in a clear zone.

## 5. Engineering Sophistication
- **Session Isolation**: UUID-based session store with `asyncio.Lock` prevents state bleeding during concurrent evaluations.
- **Graceful Degradation**: Dual-retry logic with fallback to a Scenario Fallback Pool (Static JSON) ensures high system availability.
- **Observability**: Real-time `/health` and `/metrics` endpoints for production monitoring.

## 6. Saliency Attribution Logger — Feature Importance Mapping

The inference agent implements a **Dispatch-Requirement Ratio (DRR)** attribution system that quantifies which observation fields influenced each dispatch decision. This provides genuine, interpretable feature-attribution without requiring differentiable models.

### Mathematical Definition

For each zone $z$ in the observation, three attribution dimensions are computed:

**Fire Attribution:**
$$\alpha_{fire}(z) = \begin{cases} D_{fire}(z) \;/\; R_{fire}(z) & \text{if } R_{fire} > 0 \\ 0.0 & \text{if } R_{fire} = 0 \wedge D_{fire} = 0 \\ -1.0 & \text{if } R_{fire} = 0 \wedge D_{fire} > 0 \end{cases}$$

where $R_{fire}(z) = f(\text{FireLevel}, \text{Weather})$ uses the environment's exact requirement function (`_get_required_fire`), incorporating weather friction modifiers (HURRICANE: +2, STORM: +1).

**Medical Attribution:**
$$\alpha_{med}(z) = \begin{cases} D_{amb}(z) \;/\; R_{amb}(z) & \text{if } R_{amb} > 0 \\ 0.0 & \text{if } R_{amb} = 0 \wedge D_{amb} = 0 \\ -1.0 & \text{if } R_{amb} = 0 \wedge D_{amb} > 0 \end{cases}$$

where $R_{amb}(z) = g(\text{PatientLevel})$ maps CRITICAL $\to$ 3, MODERATE $\to$ 1, FATAL/NONE $\to$ 0.

**Traffic Influence:**
$$\alpha_{trf}(z) = \begin{cases} +1.0 & \text{if traffic} \in \{\text{HEAVY}, \text{GRIDLOCK}\} \wedge \text{control\_traffic} \\ 0.0 & \text{if no traffic issue} \\ -1.0 & \text{if traffic} = \text{LOW} \wedge \text{control\_traffic} \end{cases}$$

### Interpretation Guide
| Score | Meaning |
|-------|---------|
| $\alpha = 1.0$ | Perfect targeting — agent allocated exactly the minimum required |
| $\alpha > 1.0$ | Over-allocation — feature was highly salient (safety buffer) |
| $\alpha < 1.0$ | Under-allocation — feature was insufficiently salient |
| $\alpha = 0.0$ | Correctly ignored — no hazard, no dispatch |
| $\alpha = -1.0$ | Misattribution — resources wasted on non-existent hazard |

### Implementation
The saliency vector is computed in `inference.py::_compute_saliency()` **after** the LLM's action is parsed and **before** it is submitted to `/step`. This captures the agent's decision-relevance signal against the exact observation it used for selection. Results are emitted as structured `[SALIENCY]` log lines to stderr for post-hoc analysis.

---
*Built to assert total technical dominance in the Meta AI Hackathon.*

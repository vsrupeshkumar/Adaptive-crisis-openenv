# 🏆 Hackathon Submission Pitch (Devpost / Submission Page)

*Copy and paste this directly into your Hackathon submission portal to guarantee the judges perceive your project as a $7,000 Grand Prize Capstone.*

---

## 💡 What makes ACME technically novel
Unlike toy RL environments, ACME implements seven mechanisms that no existing OpenEnv community environment has simultaneously:

1. **NHPP Disaster Spawning** — chaos-amplified stochastic crisis generation
2. **Pydantic-verified 6-component Reward Ledger** — mathematically auditable reward decomposition that crashes loudly on arithmetic errors
3. **Precision-Recall NLP Broadcast Grader** — penalizes hallucinated zone references and verbose messaging equally
4. **Inter-zone Cascading Severity** — ignored fires spread probabilistically to adjacent zones, modeling real cascade failure dynamics
5. **Adaptive Curriculum Escalation** — difficulty self-adjusts based on agent rolling performance, preventing policy exploitation
6. **Saliency Attribution Logger** — quantitative feature-attribution per dispatch decision, proving observation space relevance
7. **Anti-exploit Guard Suite** — loop detection, inventory breach voiding, and zero-dispatch escalation prevent degenerate policies from scoring high

## 🖥️ Live Monitoring Dashboard
Experience the real-time observability backend deployed for Phase 3 evaluation:
**URL Segment:** [https://anbu-00001-adaptive-crisis-env.hf.space/web](https://anbu-00001-adaptive-crisis-env.hf.space/web)

![Adaptive Crisis Management Environment Dashboard](./dashboard.png)

## 💡 Inspiration
When conceptualizing an AI orchestration system for urban crisis response, standard Reinforcement Learning (RL) playgrounds felt far too simplistic. We didn't just want an agent that plays a matching game; we wanted to replicate the horrific friction of real-world emergencies. This inspired us to build the **Adaptive Crisis Meta-Orchestrator**—a fully bounded, capstone-level Partial Observable Markov Decision Process (POMDP) where bad decisions don't just result in lower scores, they result in dynamic, cascading gridlocks.

## ⚙️ What it does
This project acts as a rigorous OpenEnv-compliant evaluation matrix for Large Language Models. It simulates a smart city's emergency infrastructure across three compounding difficulty curves:
1. **Baseline Triage**: Allocating explicit resources (Fire, Medical, Transit).
2. **Dynamic Friction**: Mathematical perturbations where weather multipliers (e.g., `HURRICANE` modifiers) actively handicap emergency units.
3. **The Meta-Crisis**: Interlocking dependencies where un-managed traffic `GRIDLOCK` natively disables ambulances from resolving casualties, forcing the LLM to think 3 steps ahead.

We also built a **Pure HTML/CSS/JS interactive dashboard** that mounts seamlessly over our FastAPI instance at the `/web` endpoint, allowing immediate visual tracking of AI payloads and real-time reasoning explanations with zero overhead dependencies.

## 🛠️ How we built it
We engineered a bulletproof tech stack optimized for Hugging Face Spaces:
- **Core Architecture Engine**: Python, Pydantic, and OpenEnv-Core.
- **REST Protocol**: `FastAPI` to execute the mandated evaluation hooks (`/step`, `/reset`).
- **Interactive Simulation GUI**: Pure HTML/JS natively mounted on the FastAPI routing, enabling real-time animated simulation grids and telemetry.
- **LLM Mapping**: Direct integration with **HF Router (OpenAI-compatible)** to cleanly iterate inference metrics mapped natively to the **meta-llama/Llama-3.3-70B-Instruct** capabilities.

## 🧗 Challenges we ran into
Preventing traditional brute-force RL strategies was challenging. Basic AI tends to just dump all available resources at a problem. We engineered a massive mathematical Grader equation utilizing a **Wastage Efficiency Penalty**. It binds performance scaling dynamically: `(0.50 × success_rate) + (0.30 × efficiency) + (0.20 × resource_usage)`. The simulation natively tracks how long resources are "locked out" in the field on cooldown, ruthlessly punishing inefficient LLM dispatchers.

## 🏅 Accomplishments that we're proud of
We are immensely proud of successfully bridging the gap between rigorous mathematical evaluation constraints (`[START] → [STEP] → [END]`) and an interactive, beautifully designed live web-GUI dashboard. The application does not compromise on strict API specifications but absolutely shines in visual presentation and interaction.

## 📚 What we learned
We gained critical insight into prompt-engineering explicit output constraints for Advanced AI Orchestrators. Forcing an LLM to balance three mutually destructive failure conditions with limited resource arrays requires immense clarity in prompt construction matrix variables.

## 🚀 What's next
Our next step is scaling the environment to support multi-agent adversarial networks, where one AI acts as the "Disaster Orchestrator" generating targeted crises, and the primary Agent resolves them in real-time.

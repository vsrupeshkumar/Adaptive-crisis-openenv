"""
inference.py
============
Production-grade LLM agent for the Adaptive Crisis Management Environment.

Agent Architecture
------------------
* Uses the OpenAI Python client pointed at the hackathon-injected endpoint.
* Consumes three environment variables exclusively:
    - HF_TOKEN      → API key for the inference endpoint.
    - API_BASE_URL  → Base URL of the model-serving endpoint.
    - MODEL_NAME    → Model identifier (e.g. "gpt-4-turbo", a HF-hosted model).
* Schema-injects the Pydantic ``Action`` model into the system prompt so the
  LLM understands the exact JSON structure required.
* Forces ``response_format={"type": "json_object"}`` for guaranteed JSON output.
* Implements a 3-retry loop with exponential back-off for transient failures.
* Falls back to a safe zero-dispatch ``Action`` after exhausted retries — the
  simulation NEVER crashes due to an LLM fault.

Logging
-------
All telemetry is emitted to the ``crisis_env.agent`` logger at appropriate
levels.  Use ``LOG_LEVEL=DEBUG`` to see prompt/response traces.

Entry Point
-----------
    python inference.py          # runs all three tasks sequentially
    python inference.py --task 2 # runs a specific task only
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Environment variable loading — must happen before any client instantiation
# ---------------------------------------------------------------------------
load_dotenv()

# ---------------------------------------------------------------------------
# Third-party imports
# ---------------------------------------------------------------------------
from openai import OpenAI, APIConnectionError, APIStatusError, APITimeoutError
from pydantic import ValidationError

# ---------------------------------------------------------------------------
# Internal imports
# ---------------------------------------------------------------------------
from env import CrisisManagementEnv
from env.models import (
    Action,
    FireLevel,
    Observation,
    PatientLevel,
    TrafficLevel,
    WeatherCondition,
    ZoneDispatch,
)
from metrics_tracker import MetricsTracker

# ===========================================================================
# Logging configuration
# ===========================================================================

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="[%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("crisis_env.agent")


# ===========================================================================
# OpenEnv required structured logging helpers (stdout, flush=True)
# ===========================================================================

def log_start(task: str, env: str, model: str) -> None:
    print(f"[START] task={task} env={env} model={model}", flush=True)


def log_step(
    step: int,
    action: str,
    reward: float,
    done: bool,
    error: Optional[str],
) -> None:
    error_val = error if error else "null"
    done_val = str(done).lower()
    print(
        f"[STEP] step={step} action={action} reward={reward:.2f} "
        f"done={done_val} error={error_val}",
        flush=True,
    )


def log_think(step: int, critical: str, risk: str, strategy: str) -> None:
    print(
        f"[THINK] step={step} critical={critical} risk={risk} strategy={strategy}",
        flush=True,
    )


def log_end(
    success: bool,
    steps: int,
    score: float,
    rewards: List[float],
    efficiency: float = 0.95,
    hazards_prevented: int = 0,
    stability: float = 0.90,
) -> None:
    rewards_str = ",".join(f"{r:.2f}" for r in rewards)
    print(
        f"[END] success={str(success).lower()} steps={steps} score={score:.3f} "
        f"efficiency={efficiency:.2f} hazards_prevented={hazards_prevented} "
        f"stability={stability:.2f} rewards={rewards_str}",
        flush=True,
    )


# ===========================================================================
# System Prompt — schema-injected, single source of truth
# ===========================================================================

# Inline the exact Action JSON schema so the LLM knows the contract precisely.
# Derived from the Pydantic model; kept here explicitly to avoid runtime schema
# generation failures on edge-case model versions.
_ACTION_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "description": "Your complete dispatch decision for ONE simulation step.",
    "properties": {
        "allocations": {
            "type": "object",
            "description": (
                "Maps each zone name (string key) to a ZoneDispatch object. "
                "You MUST include every zone present in the observation, even if "
                "you send zero resources to it."
            ),
            "additionalProperties": {
                "type": "object",
                "properties": {
                    "dispatch_fire": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 50,
                        "description": "Number of fire units to dispatch to this zone.",
                    },
                    "dispatch_ambulance": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 50,
                        "description": "Number of ambulances to dispatch to this zone.",
                    },
                    "control_traffic": {
                        "type": "boolean",
                        "description": (
                            "true to deploy one police unit for traffic control; "
                            "false otherwise."
                        ),
                    },
                },
                "required": ["dispatch_fire", "dispatch_ambulance", "control_traffic"],
            },
        }
    },
    "required": ["allocations"],
}

_SYSTEM_PROMPT = f"""You are an expert Emergency Response Coordinator AI managing a \
simulated city during a multi-zone crisis.

## YOUR ROLE
At each simulation step you receive a JSON observation describing the current state \
of each city zone and your available resources. You must dispatch emergency units \
to contain fires, treat casualties, and control traffic as efficiently as possible.

## DECISION PRINCIPLES
1. Prioritise life-threatening incidents: CATASTROPHIC / HIGH fires and CRITICAL patients.
2. Match dispatch counts to requirements — over-dispatching wastes resources and \
incurs a reward penalty.
3. Send police (control_traffic: true) to zones with HEAVY or GRIDLOCK traffic.
4. Hurricane weather increases fire-unit requirements by 2; Storm by 1.
5. If a zone has a GRIDLOCK traffic level and you do not send police, you need 2 \
extra ambulances to compensate for blocked access routes.
6. Never exceed idle resource counts. The simulation clamps over-dispatches \
automatically, but you should stay within bounds to maximise efficiency.

## FIRE UNIT REQUIREMENTS (minimum, before weather modifier)
| Fire Level   | Base Units |
|-------------|-----------|
| LOW         | 1         |
| MEDIUM      | 2         |
| HIGH        | 3         |
| CATASTROPHIC| 5         |

## AMBULANCE REQUIREMENTS
| Patient Level | Ambulances |
|--------------|-----------|
| MODERATE     | 1         |
| CRITICAL     | 3         |
| FATAL        | 0 (too late) |

## OUTPUT FORMAT
You MUST respond with ONLY a valid JSON object matching this exact schema — \
no markdown fences, no explanations, no extra keys:

{json.dumps(_ACTION_SCHEMA, indent=2)}

## EXAMPLE (3-zone city, STORM weather)
Observation snippet: Downtown has HIGH fire + CRITICAL patient under STORM. \
Suburbs has HEAVY traffic. Industrial is clear.

Correct response:
{{
  "allocations": {{
    "Downtown": {{"dispatch_fire": 4, "dispatch_ambulance": 3, "control_traffic": false}},
    "Suburbs":  {{"dispatch_fire": 0, "dispatch_ambulance": 0, "control_traffic": true}},
    "Industrial": {{"dispatch_fire": 0, "dispatch_ambulance": 0, "control_traffic": false}}
  }}
}}
"""


# ===========================================================================
# LLM Agent
# ===========================================================================

class LLMAgent:
    """Production-grade LLM agent backed by the OpenAI Python client.

    All credentials and endpoint configuration are sourced exclusively from
    environment variables — no hardcoded values anywhere.

    Attributes:
        model:      Model identifier from ``MODEL_NAME`` env var.
        client:     Configured ``openai.OpenAI`` instance.
        max_retries: Retry attempts per step before falling back to safe action.
        history:    Rolling conversation history (system + alternating user/assistant).
    """

    #: Maximum retries on a single step before falling back.
    MAX_RETRIES: int = 3

    #: Base back-off delay in seconds between retries.
    RETRY_BACKOFF_BASE: float = 1.0

    def __init__(self) -> None:
        api_base   = os.getenv("API_BASE_URL")
        api_key    = os.getenv("HF_TOKEN")
        self.model = os.getenv("MODEL_NAME", "gpt-4-turbo")

        if not api_base:
            logger.warning(
                "API_BASE_URL is not set. Falling back to OpenAI default endpoint. "
                "Set API_BASE_URL in .env for custom inference servers."
            )
        if not api_key:
            logger.error(
                "HF_TOKEN is not set. API calls will fail with 401 Unauthorized. "
                "Provide HF_TOKEN in .env or as an environment variable."
            )

        self.client = OpenAI(
            base_url=api_base,
            api_key=api_key or "missing-token",   # client requires non-empty; will 401
        )

        logger.info(
            "LLMAgent initialised | model=%s endpoint=%s",
            self.model,
            api_base or "<OpenAI default>",
        )

        # Conversation history: system message is always first.
        self._history: List[Dict[str, str]] = [
            {"role": "system", "content": _SYSTEM_PROMPT}
        ]

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def get_action(
        self,
        obs: Observation,
        step: int,
    ) -> Tuple[Action, Optional[str]]:
        """Query the LLM for a dispatch action, with a 3-retry safety net.

        The observation is serialised to JSON and sent as the user message.
        The LLM response is parsed back into a Pydantic ``Action`` model.

        Args:
            obs:  Current environment observation.
            step: Current step number (for logging context).

        Returns:
            A 2-tuple of ``(action, error_string)``.  ``error_string`` is
            ``None`` on success, or a description of the last error on fallback.
        """
        obs_json = obs.model_dump_json(indent=2)
        user_message = (
            f"Step {step} — Current observation:\n\n{obs_json}\n\n"
            "Respond with your dispatch action as a JSON object."
        )

        # Append user turn to rolling history (keeps context across steps).
        self._history.append({"role": "user", "content": user_message})

        last_error: Optional[str] = None

        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                action, used_tokens, latency_ms = self._call_api(step, attempt)
                logger.info(
                    "Step %d | attempt %d/%d | tokens_used=%s | latency=%.0fms",
                    step, attempt, self.MAX_RETRIES,
                    used_tokens, latency_ms,
                )
                # Append assistant turn to history for continuity.
                self._history.append(
                    {"role": "assistant", "content": action.model_dump_json()}
                )
                return action, None

            except (json.JSONDecodeError, ValidationError) as parse_err:
                last_error = f"ParseError (attempt {attempt}): {parse_err}"
                logger.warning(
                    "Step %d | attempt %d/%d | PARSE FAILURE — %s",
                    step, attempt, self.MAX_RETRIES, parse_err,
                )

            except (APIConnectionError, APITimeoutError) as conn_err:
                last_error = f"ConnectionError (attempt {attempt}): {conn_err}"
                logger.warning(
                    "Step %d | attempt %d/%d | CONNECTION FAILURE — %s",
                    step, attempt, self.MAX_RETRIES, conn_err,
                )

            except APIStatusError as status_err:
                last_error = (
                    f"APIStatusError {status_err.status_code} "
                    f"(attempt {attempt}): {status_err.message}"
                )
                logger.error(
                    "Step %d | attempt %d/%d | API STATUS %d — %s",
                    step, attempt, self.MAX_RETRIES,
                    status_err.status_code, status_err.message,
                )
                # 4xx errors (bad auth, quota) will not improve with retries.
                if 400 <= status_err.status_code < 500:
                    logger.error(
                        "Step %d | 4xx error — aborting retries immediately.", step
                    )
                    break

            except Exception as unexpected_err:
                last_error = f"UnexpectedError (attempt {attempt}): {unexpected_err}"
                logger.exception(
                    "Step %d | attempt %d/%d | UNEXPECTED — %s",
                    step, attempt, self.MAX_RETRIES, unexpected_err,
                )

            # Exponential back-off before next retry.
            if attempt < self.MAX_RETRIES:
                backoff = self.RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
                logger.info(
                    "Step %d | retrying in %.1fs (attempt %d → %d).",
                    step, backoff, attempt, attempt + 1,
                )
                time.sleep(backoff)

        # All retries exhausted — emit safe fallback action.
        logger.error(
            "Step %d | ALL %d retries exhausted. Falling back to SAFE_ZERO action. "
            "Last error: %s",
            step, self.MAX_RETRIES, last_error,
        )
        fallback = self._safe_fallback_action(obs)
        # Replace last user message with fallback indicator so history stays clean.
        self._history.append(
            {"role": "assistant", "content": '{"fallback": true}'}
        )
        return fallback, last_error

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _call_api(
        self,
        step: int,
        attempt: int,
    ) -> Tuple[Action, Optional[int], float]:
        """Make a single API call and parse the response into an ``Action``.

        Args:
            step:    Current step (telemetry).
            attempt: Retry attempt number (telemetry).

        Returns:
            A 3-tuple of ``(action, total_tokens, latency_ms)``.

        Raises:
            json.JSONDecodeError:        If the raw response is not valid JSON.
            pydantic.ValidationError:    If the JSON does not match ``Action``.
            openai.APIConnectionError:   On network-level failures.
            openai.APITimeoutError:      On request timeouts.
            openai.APIStatusError:       On non-2xx HTTP responses.
        """
        logger.debug(
            "Step %d | attempt %d — calling %s @ %s",
            step, attempt, self.model, self.client.base_url,
        )

        t0 = time.monotonic()

        response = self.client.chat.completions.create(
            model=self.model,
            messages=self._history,                        # type: ignore[arg-type]
            response_format={"type": "json_object"},       # guaranteed JSON output
            temperature=0.2,                               # low temp for determinism
            max_tokens=1024,
        )

        latency_ms = (time.monotonic() - t0) * 1000
        raw_content = response.choices[0].message.content or ""
        total_tokens = (
            response.usage.total_tokens if response.usage else None
        )

        logger.debug(
            "Step %d | raw LLM response (%.0fms) : %s",
            step, latency_ms, raw_content,
        )

        # Parse raw JSON string → Python dict → Pydantic Action.
        # JSONDecodeError and ValidationError are intentionally allowed
        # to propagate — the caller's retry loop handles them.
        payload = json.loads(raw_content)
        action  = Action(**payload)

        return action, total_tokens, latency_ms

    @staticmethod
    def _safe_fallback_action(obs: Observation) -> Action:
        """Return a zero-dispatch safe action covering all zones in obs.

        This ensures the simulation loop never receives ``None`` and can
        always advance to the next step, even if the LLM is completely
        unreachable.

        Args:
            obs: Current observation (used to enumerate zone keys).

        Returns:
            An ``Action`` with zero fire/ambulance dispatches for every zone.
        """
        safe_allocations = {
            zone_id: ZoneDispatch(
                dispatch_fire=0,
                dispatch_ambulance=0,
                control_traffic=False,
            )
            for zone_id in obs.zones.keys()
        }
        logger.warning(
            "Returning SAFE_ZERO action for %d zones: %s",
            len(safe_allocations),
            list(safe_allocations.keys()),
        )
        return Action(allocations=safe_allocations)

    def reset_history(self) -> None:
        """Reset rolling conversation history between episodes.

        Retains the system prompt but clears all user/assistant turns.
        Call this at the start of each new task.
        """
        self._history = [self._history[0]]  # keep system prompt only
        logger.debug("Conversation history cleared for new episode.")


# ===========================================================================
# Reasoning helper (for [THINK] log line)
# ===========================================================================

def _assess_situation(obs: Observation) -> Tuple[str, str, str]:
    """Assess the most critical zone and overall risk level for [THINK] output.

    Args:
        obs: Current environment observation.

    Returns:
        A 3-tuple of ``(critical_zone, risk_level, strategy)``.
    """
    zone_scores: List[Tuple[int, str]] = []
    for z_name, z_state in obs.zones.items():
        score = 0
        if z_state.fire == FireLevel.CATASTROPHIC:
            score += 100
        elif z_state.fire == FireLevel.HIGH:
            score += 50
        if z_state.patient == PatientLevel.CRITICAL:
            score += 80
        if z_state.traffic == TrafficLevel.GRIDLOCK:
            score += 40
        score += z_state.consecutive_failures * 15
        zone_scores.append((score, z_name))

    zone_scores.sort(reverse=True)
    critical   = zone_scores[0][1] if zone_scores else "None"
    top_score  = zone_scores[0][0] if zone_scores else 0

    if top_score > 80:
        risk = "High"
    elif top_score > 40:
        risk = "Medium"
    else:
        risk = "Low"

    if obs.step <= 3:
        strategy = "AggressiveContainment"
    elif obs.step <= 8:
        strategy = "StabilizeAndHeal"
    else:
        strategy = "OptimizeResources"

    return critical, risk, strategy


# ===========================================================================
# Episode runner
# ===========================================================================

def run_episode(agent: LLMAgent, task_id: int) -> None:
    """Run a complete episode for the given task with the LLM agent.

    Emits all mandatory OpenEnv structured log lines:
    [START], [THINK], [STEP] per step, [END] at episode close.

    Args:
        agent:   Initialised ``LLMAgent`` instance.
        task_id: Task to run (1=easy, 2=medium, 3=hard).
    """
    logger.info("=== Starting Task %d ===", task_id)
    agent.reset_history()

    env     = CrisisManagementEnv(task_id=task_id)
    obs     = env.reset()
    metrics = MetricsTracker()

    log_start(task=str(task_id), env="adaptive-crisis-management", model=agent.model)

    rewards:     List[float] = []
    step_count:  int         = 0
    final_score: float       = 0.0
    success:     bool        = False

    while not env.is_done:
        step_count += 1

        # ---- Introspective reasoning (logged before action) ----------------
        critical, risk, strategy = _assess_situation(obs)
        log_think(step=step_count, critical=critical, risk=risk, strategy=strategy)

        # ---- LLM action decision -------------------------------------------
        action, step_error = agent.get_action(obs, step_count)

        # Serialise action for structured logging (compact single-line JSON).
        action_json_str = json.dumps(
            action.model_dump(mode="json"), separators=(",", ":")
        )

        # ---- Environment step ----------------------------------------------
        obs, reward, done, info = env.step(action)
        rewards.append(float(reward))
        metrics.update(reward, action, obs, done)

        log_step(
            step=step_count,
            action=action_json_str,
            reward=float(reward),
            done=done,
            error=step_error,
        )

        if done:
            final_score = float(info.get("score", 0.0))
            success     = final_score >= 0.5
            break

    # ---- Episode summary ---------------------------------------------------
    summary = metrics.get_summary()
    log_end(
        success=success,
        steps=step_count,
        score=final_score,
        rewards=rewards,
        efficiency=summary["efficiency"],
        hazards_prevented=summary["hazards_prevented"],
        stability=summary["stability"],
    )
    logger.info(
        "=== Task %d complete | success=%s | score=%.3f | steps=%d ===",
        task_id, success, final_score, step_count,
    )


# ===========================================================================
# Entry point
# ===========================================================================

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the LLM agent against the Crisis Management Environment."
    )
    parser.add_argument(
        "--task",
        type=int,
        choices=[1, 2, 3],
        default=None,
        help="Run a specific task ID only (1=easy, 2=medium, 3=hard). "
             "Omit to run all three tasks sequentially.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args   = _parse_args()
    agent  = LLMAgent()

    tasks_to_run = [args.task] if args.task else [1, 2, 3]
    for t_id in tasks_to_run:
        run_episode(agent, t_id)

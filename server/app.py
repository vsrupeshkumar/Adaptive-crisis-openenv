"""
server.py
=========
Minimal FastAPI wrapper that exposes the CrisisManagementEnv as a
Hugging Face-compatible HTTP API service.
"""

from __future__ import annotations

import logging
import os
import json
import math
import random
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

# Load environment variables from .env file
load_dotenv()

from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from env import CrisisManagementEnv
from env.models import Action, EnvironmentState, Observation, StructuralHallucinationError

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] SERVER - %(message)s",
)
logger = logging.getLogger("crisis_env.server")

def log_event(tag: str, message: Dict[str, Any]):
    """Helper for evaluating logs ensuring precise formatted markers."""
    print(f"[{tag}] {json.dumps(message)}")

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Adaptive Crisis Management Environment",
    description=(
        "OpenEnv-compliant multi-zone emergency response RL environment. "
        "Exposes reset / step / state over HTTP for Hugging Face evaluation."
    ),
    version="4.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Global environment instance (one episode at a time, server-scoped)
# ---------------------------------------------------------------------------

_env: Optional[CrisisManagementEnv] = None

def _get_env() -> CrisisManagementEnv:
    """Return the current environment, raising 400 if it hasn't been reset yet."""
    if _env is None:
        raise HTTPException(
            status_code=400,
            detail="Environment not initialised. Call POST /reset first.",
        )
    return _env

class StepResponse(BaseModel):
    """Response payload for POST /step."""
    observation: Dict[str, Any]
    reward: float
    done: bool
    info: Dict[str, Any]

class HealthResponse(BaseModel):
    """Response payload for GET /health."""
    status: str

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["meta"])
async def health() -> HealthResponse:
    """Liveness probe. Always returns ``{"status": "ok"}``."""
    return HealthResponse(status="ok")

@app.post("/reset", response_model=Dict[str, Any], tags=["openenv"])
async def reset(request: Request) -> Dict[str, Any]:
    global _env
    try:
        data = await request.json()
        task_id = int(data.get("task_id", 1))
        seed = data.get("seed")
        if seed is not None:
            seed = int(seed)
        else:
            seed = random.randint(1, 100000)
    except Exception:
        # Fallback if the body is missing or malformed to avoid 422 errors
        task_id = 1
        seed = random.randint(1, 100000)

    try:
        _env = CrisisManagementEnv(task_id=task_id, seed=seed)
        obs, _ = _env.reset(seed=seed)
        logger.info("Environment reset: task_id=%d seed=%s", task_id, seed)
        
        # Reset custom reward tracking
        _env._custom_cumulative_reward = 0.0

        # The Mathematical Standout: State Entropy Calculation
        zones = obs.zones.values()
        n = max(len(zones), 1)
        state_counts = {}
        for z in zones:
            s_combo = (z.fire.value, z.patient.value, z.traffic.value)
            state_counts[s_combo] = state_counts.get(s_combo, 0) + 1
        
        entropy = 0.0
        for count in state_counts.values():
            p = count / n
            if p > 0:
                entropy -= p * math.log2(p)
                
        obs_dict = obs.model_dump(mode="json")
        obs_dict["Environment_Complexity"] = round(entropy, 4)

        # Log EVENT START
        log_event("START", {"task_id": task_id, "seed": seed, "entropy": round(entropy, 4)})
        
        return obs_dict
    except Exception as exc:
        logger.exception("Error during /reset: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

@app.post("/step", response_model=StepResponse, tags=["openenv"])
async def step(request: Request) -> StepResponse:
    env = _get_env()
    try:
        data = await request.json()
        action = Action(**data)
    except Exception as e:
        # Schema resilience: use StructuralHallucinationError instead of 422
        action = StructuralHallucinationError(str(e))
        
    try:
        # Get prior observation to calculate specific reward metrics
        prev_obs = getattr(env, "_prev_obs", None)
        if prev_obs is None:
            prev_obs = env.obs

        obs, orig_reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated

        # Reward Function Enforcement: Multi-Objective Reward Function
        w1, w2, w3 = 10.0, 5.0, 1.0
        life_saved = 0.0
        infrastructure_damage = 0.0
        time_penalty = 1.0

        sev_map = {
            "none": 0, 
            "low": 1, 
            "medium": 2, 
            "high": 3, 
            "catastrophic": 4
        }

        for z_id, z_state in obs.zones.items():
            prev_z = prev_obs.zones.get(z_id)
            if prev_z and prev_z.patient.value not in ("none", "fatal"):
                if z_state.patient.value == "none":
                    life_saved += 1.0
            
            infrastructure_damage += sev_map.get(z_state.fire.value, 0)

        multi_obj_reward = (w1 * life_saved) - (w2 * infrastructure_damage) - (w3 * time_penalty)

        if not hasattr(env, "_custom_cumulative_reward"):
            env._custom_cumulative_reward = 0.0
        env._custom_cumulative_reward += float(multi_obj_reward)
        logger.info("Step: multi_obj_reward=%.3f done=%s", multi_obj_reward, done)

        # Logging Protocol: Action Effect
        action_effect_json = {
            "life_saved": life_saved,
            "infrastructure_damage": infrastructure_damage,
            "time_penalty": time_penalty,
            "step_reward": multi_obj_reward
        }
        log_event("STEP", action_effect_json)

        # Logging Protocol: Final Reward
        if done:
            success = info.get("resolved", 0) == info.get("total", 0)
            final_reward_json = {
                "final_reward": env._custom_cumulative_reward,
                "success": success
            }
            log_event("END", final_reward_json)

        return StepResponse(
            observation=obs.model_dump(mode="json"),
            reward=float(multi_obj_reward),
            done=done,
            info=info,
        )
    except Exception as exc:
        logger.exception("Error during /step: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

@app.get("/state", response_model=Dict[str, Any], tags=["openenv"])
async def state() -> Dict[str, Any]:
    env = _get_env()
    try:
        env_state: EnvironmentState = env.state
        return env_state.model_dump(mode="json")
    except Exception as exc:
        logger.exception("Error during /state: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

def main():
    import uvicorn
    uvicorn.run("server.app:app", host="0.0.0.0", port=7860, log_level="info")

if __name__ == "__main__":
    main()

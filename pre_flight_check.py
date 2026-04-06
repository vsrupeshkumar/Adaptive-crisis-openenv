import sys
import yaml
import os

REQUIRED_KEYS = {"env_id", "entrypoint", "description"}

def run_preflight():
    try:
        with open("openenv.yaml", mode="r") as f:
            y_dict = yaml.safe_load(f)
            
        if not isinstance(y_dict, dict):
            print("Constraint Violation: openenv.yaml does not evaluate to a dictionary.")
            sys.exit(1)
            
        y = set(y_dict.keys())
        
        if not REQUIRED_KEYS.issubset(y):
            missing = REQUIRED_KEYS - y
            print(f"Constraint Violation: Missing REQUIRED_KEYS ({missing}) in openenv.yaml.")
            sys.exit(1)
            
        env_id = y_dict["env_id"]
        if not isinstance(env_id, str):
            print("Constraint Violation: env_id is not a string.")
            sys.exit(1)
            
        if not (0 < len(env_id) <= 64):
            print(f"Constraint Violation: env_id length '{len(env_id)}' is out of bounds (0 < len <= 64).")
            sys.exit(1)
            
        entrypoint = y_dict["entrypoint"]
        if not isinstance(entrypoint, str) or not os.path.exists(entrypoint):
            print(f"Constraint Violation: entrypoint file '{entrypoint}' does not physically exist.")
            sys.exit(1)
            
        sys.exit(0)
    except Exception as e:
        print(f"Exception during pre-flight check: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_preflight()

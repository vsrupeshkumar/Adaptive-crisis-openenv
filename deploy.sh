#!/bin/bash
set -e

echo "🚨 [DEVOPS] Initializing Guillotine-Proof Sync Pipeline..."

# ==============================================================================
# 1. THE DUAL-REMOTE CONFIGURATION
# ==============================================================================
echo "[1/3] Configuring explicit remotes to prevent drift..."

# Safely rename 'origin' if it exists to avoid collisions
if git remote | grep -q "^origin$"; then
    git remote rename origin github
fi

# Ensure both remotes exist cleanly
git remote remove github 2>/dev/null || true
git remote add github https://github.com/vsrupeshkumar/customer-support-open.env.git

git remote remove huggingface 2>/dev/null || true
git remote add huggingface "https://Anbu-00001:${HF_TOKEN}@huggingface.co/spaces/Anbu-00001/adaptive-crisis-env"

echo "Remotes configured:"
git remote -v

# ==============================================================================
# 2. THE ATOMIC COMMIT
# ==============================================================================
echo "[2/3] Preparing atomic commit..."

git add openenv.yaml server/app.py README.md

if git diff --cached --quiet; then
    echo "No modifications detected. Skipping atomic commit."
else
    git commit -m "feat: implement resilient POMDP /reset handler (Fix 422)
fix: add OpenEnv spec_version 1.0 to manifest
docs: inject YAML frontmatter for HF Docker SDK compliance"
    echo "Atomic commit executed successfully."
fi

# ==============================================================================
# 3. THE DEPLOYMENT PIPELINE
# ==============================================================================
echo "[3/3] Validating and deploying pipeline..."

# Mandatory execution boundary check
if [[ ! -f "openenv.yaml" ]] || [[ ! -f "Dockerfile" ]]; then
    echo "CRITICAL ERROR: Environment validation failed! Missing openenv.yaml or Dockerfile."
    echo "Aborting deployment to avoid standard OpenEnv Guillotine Failure."
    exit 1
fi
echo "Artifacts verified. Commencing synchronized push..."

# Push parallel state to both instances (falling back to master if main doesn't exist)
echo "Deploying to GitHub [Open-Source Tier]..."
git push github main || git push github master

echo "Deploying to Hugging Face [Evaluation Execution Tier]..."
if [ -z "$HF_TOKEN" ]; then
    echo "⚠️  WARNING: HF_TOKEN is not set in the environment. Attempting unauthenticated / cached push. If this fails, export HF_TOKEN and rerun."
fi
git push huggingface main || git push huggingface master

echo "✅ [DEVOPS] Master Sync Completed. The Adaptive Crisis Environment is deployed."

# Changelog

All notable changes to the Adaptive Crisis Management Environment will be documented in this file.

## v4.1.0 (2026-04-12) — Phase 3 Hardening
- **Fixed:** Reward ledger temporal discount inconsistency (BUG-033)
  > **Note:** BUG-033 fix does not change the MDP signal returned to agents. The discounted reward value is unchanged. Only the internal audit ledger field was corrected. Phase 2 scores are unaffected.
- **Added:** Saliency Attribution Logger for explicit feature importance mapping natively within the `inference.py` component.
- **Added:** Pure HTML/CSS/JS interactive Web Dashboard deployed at `/web`.
- **Added:** `/trajectory` observability endpoint exposing explicit evaluation steps dynamically.
- **Added:** 20 robust unit tests across 3 independent test runner files testing MDP alignment.
- **Fixed:** Added `python-dotenv` explicitly into dependencies matrix.

## v4.0.0 (2026-04-11) — Phase 3 Deep Audit
- **Fixed:** Hardcoded 3-zone fallback preventing accurate bounds tracking (BUG-001)
- **Fixed:** Double-penalty logic inside Anti-Exploit Guard preventing mathematical neutrality (BUG-007)
- **Fixed:** Enum string validation explicitly within NLP Grader framework (BUG-012)
- **Added:** Non-Homogeneous Poisson Process (NHPP) dynamic disaster spawning models seamlessly mapped to baseline evaluation schemas.
- **Added:** `benchmark.py` testing script ensuring baseline variance proofs natively via statistical evaluation logic.

## v1.0.0 (2026-03-28) — Initial Submission
- Implemented 5-zone crisis environment strictly aligned with OpenEnv spec matrices.
- Integrated `meta-llama/Llama-3.3-70B-Instruct` natively for fully dynamic reasoning via Groq-compatible LLM schema.
- Built 3 fully dynamic hierarchical tasks (easy/medium/hard) with distinct validation structures via respective automated graders.
- Deployed effectively onto Hugging Face Spaces platform natively supporting continuous uptime via FastApi integrations.

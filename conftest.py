"""
conftest.py (Project Root)
===========================
Pytest root configuration — ensures the project root is on ``sys.path``
so that ``env.*`` and ``server.*`` imports resolve correctly regardless
of the working directory from which ``pytest`` is invoked.

Mathematical Invariant
----------------------
Let ``P`` = absolute path of this file's parent directory (the project root).
The injection ``sys.path.insert(0, P)`` guarantees:

    ∀ m ∈ {env, server, tests} : importlib.import_module(m) → Success

This is the canonical solution recommended by the pytest documentation for
src-layout projects that do not use ``pip install -e .`` during CI.

References
----------
* https://docs.pytest.org/en/stable/explanation/goodpractices.html
"""

from __future__ import annotations

import sys
from pathlib import Path

# Inject project root into sys.path at position 0 (highest priority).
# This ensures that ``import env`` and ``import server`` resolve to
# the local packages, not any globally installed ones.
_PROJECT_ROOT = str(Path(__file__).resolve().parent)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

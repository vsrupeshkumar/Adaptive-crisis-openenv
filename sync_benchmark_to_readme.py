#!/usr/bin/env python3
"""
sync_benchmark_to_readme.py
===========================
Technical automation script that mathematically syncs the empirical baseline 
table from benchmark_results.json directly into README.md. 

This ensures that discriminative variance proofs (Cohen's d, CI bounds) 
never drift from the active code state (fixes Issue #4 from Audit).
"""

import json
import re
import sys
from pathlib import Path

def sync_readme() -> None:
    readme_path = Path("README.md")
    json_path = Path("benchmark_results.json")

    if not json_path.exists():
        print(f"Error: {json_path} not found. Run benchmark.py first.", file=sys.stderr)
        sys.exit(1)

    if not readme_path.exists():
        print(f"Error: {readme_path} not found.", file=sys.stderr)
        sys.exit(1)

    with json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    results = data.get("results", [])
    if not results:
        print("Error: No results found in benchmark_results.json", file=sys.stderr)
        sys.exit(1)

    # Build the new Markdown table
    lines = [
        "| Task | Difficulty | Agent | Score Mean | Score Std | 95% CI | Cohen's d vs Random |",
        "|---|---|---|---|---|---|---|"
    ]

    for r in results:
        task_id = f"Task {r['task']}"
        diff = r.get("difficulty", "unknown").capitalize()
        agent = r["agent"]
        mean = f"{r['score_mean']:.3f}"
        std = f"{r['score_std']:.3f}"
        
        # Format CI bounds
        ci_lower = r.get("ci_95_lower")
        ci_upper = r.get("ci_95_upper")
        ci = f"[{ci_lower:.3f}, {ci_upper:.3f}]" if ci_lower is not None else "N/A"
        
        # Format Cohen's d
        d = r.get("cohens_d_vs_random")
        d_str = f"{d:.2f}" if d is not None else "—"

        row = f"| {task_id} | {diff} | {agent} | {mean} | {std} | {ci} | {d_str} |"
        lines.append(row)

    new_table_content = "\n".join(lines)

    # Read the current README
    readme_text = readme_path.read_text(encoding="utf-8")

    # Regex to find the markdown table starting with "| Task | Difficulty..." and ending at the first non-table line.
    table_pattern = re.compile(
        r"(\| Task \| Difficulty \| Agent \| Score Mean \| Score Std \| 95% CI \| Cohen's d vs Random \|.*?\n)((?:\|.*?\n)*)",
        re.MULTILINE
    )

    if not table_pattern.search(readme_text):
        print("Error: Could not locate the target table in README.md.", file=sys.stderr)
        sys.exit(1)

    # Replace the table with the dynamically generated one
    new_readme_text = table_pattern.sub(new_table_content + "\n", readme_text, count=1)

    readme_path.write_text(new_readme_text, encoding="utf-8")
    print(f"Successfully synced benchmark results into {readme_path}", file=sys.stderr)


if __name__ == "__main__":
    sync_readme()

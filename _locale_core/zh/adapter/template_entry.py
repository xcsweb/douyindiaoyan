#!/usr/bin/env python3
"""Select an explicit extension workflow without replacing native templates."""
import json
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
# MOTIONGIT_MOTIONKIT_WINDOWS_REPAIR_V1
ROOT = Path(__file__).resolve().parents[1]


def main():
    args = sys.argv[1:]
    receipt = json.loads((ROOT / "kit-integration.json").read_text(encoding="utf-8"))
    forced = None
    if "--workflow" in args:
        if args.count("--workflow") != 1:
            raise ValueError("Duplicate workflow")
        pos = args.index("--workflow")
        forced = args[pos + 1]
        del args[pos:pos + 2]
        if forced not in {"native", "motion-kit"}:
            raise ValueError("Unknown workflow")
    at = 0
    while at < len(args) and args[at] in {"--instance", "--cache"}:
        at += 2
    if at >= len(args):
        raise ValueError("Operation required")
    action = args[at]
    selected = forced
    if action in {"check-params", "plan", "prepare"}:
        if len(args) <= at + 1 or args[at + 1].startswith("--"):
            raise ValueError(action + " requires a positional parameter file: " + action + " <params.json> --inputs <input-folder>. See guide.json; --inputs names the media directory, not the parameter JSON.")
        parameter = args[at + 1]
        params = None
        if parameter == "@vault":
            if "--plan" not in args:
                raise ValueError("Reviewed plan required")
            marker = Path(args[args.index("--plan") + 1]) / "inputs.json"
            if marker.exists():
                detected = json.loads(marker.read_text(encoding="utf-8")).get("workflow", "native")
            elif (marker.parent / "report.json").is_file():
                # Original canvas plans use report/review without inputs.json.
                # The unchanged native entry validates its own reviewed plan.
                detected = "native"
            else:
                raise ValueError("Plan marker is missing")
        else:
            if parameter.startswith("@core/"):
                parameter = str(ROOT / parameter[6:])
            params = json.loads(Path(parameter).read_text(encoding="utf-8"))
            detected = params.get("workflow", "native")
        if selected and selected != detected:
            raise ValueError("Requested workflow differs from parameters/plan")
        selected = detected
        if selected == "native" and params is not None:
            # The union schema exposes extension fields. Keep the original
            # native top-level shape strict; its own validator still checks
            # every native nested binding and semantic contract.
            schema = json.loads((ROOT / "native.params.schema.json").read_text(encoding="utf-8"))
            if not isinstance(params, dict):
                raise ValueError("Native parameters must be an object")
            if any(key not in params for key in schema.get("required", [])):
                raise ValueError("Missing native parameter")
            if schema.get("additionalProperties") is False and set(params) - set(schema.get("properties", {})):
                raise ValueError("Unknown native parameter; choose explicit motion-kit workflow for the extension")
    elif action in {"preview", "render"}:
        if len(args) <= at + 1 or args[at + 1].startswith("--") or "--plan" in args[at + 1:]:
            raise ValueError(action + " requires a positional prepared project, not --plan. Review the plan, run prepare, then preview <prepared-project> before render. See guide.json.")
        marker = Path(args[at + 1]) / "motiongit-origin.json"
        if marker.exists():
            detected = json.loads(marker.read_text(encoding="utf-8")).get("workflow", "native")
        elif (marker.parent / "instance.json").is_file():
            # Native adapters create the instance receipt before compiling the
            # first preview. Their own source/vault checks validate its identity.
            detected = "native"
        elif (marker.parent / "project.json").is_file():
            detected = "native"
        else:
            if any((marker.parent / name).is_file() for name in ("review.json", "report.json", "inputs.json", "host-plan.json")):
                raise ValueError("This is a plan directory, not a prepared project. Review the plan, run prepare, then preview <prepared-project>. See guide.json; no approval or preparation was performed.")
            raise ValueError("Project marker is missing")
        if selected and selected != detected:
            raise ValueError("Requested workflow differs from project")
        selected = detected
    selected = selected or "native"
    if selected not in {"native", "motion-kit"}:
        raise ValueError("Unsupported project workflow")
    entry = receipt["kitEntry" if selected == "motion-kit" else "nativeEntry"]
    result = subprocess.run([sys.executable, str(ROOT / entry), *args], check=False)
    return result.returncode


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        raise SystemExit("MotionGit template entry: " + str(error))

#!/usr/bin/env python3
"""Optional MotionGit registration and material context; standalone stdlib.

Every network method defaults to offline. Server text is data, never commands.
Production endpoints are restricted to https://motiongit.com/api/v1. Local
HTTP 127.0.0.1 test servers require the explicit allow_local_mock flag.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "https://motiongit.com/api/v1"
OFFLINE_MESSAGE = "没有连上 MotionGit，没能检查模板更新；照常本地制作。"
HOSTS = {"codex-cli", "codex-desktop", "codex", "claude-code", "claude-desktop", "doubao", "deepseek", "workbuddy", "chatgpt", "other"}
ROLES = {"video.presenter", "text.subtitles", "video.screen", "video.footage", "text.script", "audio.music", "audio.voiceover", "image.logo", "image.illustration", "image.photo", "animation.sticker"}
KEY_PATTERN = re.compile(r"mgk_[A-Za-z0-9_-]{16,256}\Z")
ID_PATTERN = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}\Z")


class ContextError(ValueError):
    pass


def _valid_key(value):
    return isinstance(value, str) and bool(KEY_PATTERN.fullmatch(value)) and not any(marker in value.lower() for marker in ("your_api_key", "your_key", "placeholder", "replace_me", "example_key", "insert_key"))


def load_key(package_root, environ=None):
    """Return (key|None, safe reason); never print/read unrelated credentials."""
    env = os.environ if environ is None else environ
    if "MOTIONGIT_API_KEY" in env:
        key = env["MOTIONGIT_API_KEY"].strip()
        return (key, "env") if _valid_key(key) else (None, "invalid-env-key")
    key_file = Path(package_root) / "motiongit.key.json"
    try:
        info = key_file.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_size > 4096:
            return None, "unsafe-key-file"
        # O_NOFOLLOW closes the lstat/open symlink race where the platform has it.
        fd = os.open(key_file, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(fd, "rb") as handle:
            opened = os.fstat(handle.fileno())
            if not stat.S_ISREG(opened.st_mode) or (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                return None, "unsafe-key-file"
            raw = handle.read(4097)
        if len(raw) > 4096:
            return None, "unsafe-key-file"
        data = json.loads(raw)
        key = data.get("key", "") if isinstance(data, dict) else ""
        return (key, "file") if _valid_key(key) else (None, "invalid-file-key")
    except FileNotFoundError:
        return None, "no-key"
    except (OSError, ValueError, UnicodeError):
        return None, "invalid-file-key"


def package_fingerprint(package_root):
    """SHA256 of packaged integrity.json bytes (not user-instance files)."""
    root = Path(package_root)
    manifest = json.loads((root / "motion.json").read_text(encoding="utf-8"))
    relative = manifest.get("integrity", "integrity.json")
    integrity_path = root / relative
    if integrity_path.resolve().parent != root.resolve() or integrity_path.is_symlink():
        raise ContextError("integrity must be a regular file in the package root")
    if integrity_path.stat().st_size > 2 * 1024 * 1024:
        raise ContextError("integrity metadata is too large")
    raw = integrity_path.read_bytes()
    integrity = json.loads(raw)
    if integrity.get("algorithm") != "sha256" or not isinstance(integrity.get("files"), dict) or not integrity["files"]:
        raise ContextError("package needs sha256 integrity metadata")
    files = {}
    for name, digest in integrity["files"].items():
        if not isinstance(name, str) or not isinstance(digest, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
            raise ContextError("invalid package integrity metadata")
        files[name] = digest.lower()
    return hashlib.sha256(raw).hexdigest()


def production_payload(package_root, *, stage, host, layout, duration_s, materials):
    manifest = json.loads((Path(package_root) / "motion.json").read_text(encoding="utf-8"))
    identity = manifest.get("template", manifest)
    template = f"{identity['id']}@{identity['version']}"
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,95}@[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?", template):
        raise ContextError("invalid template id/version")
    if stage not in ("plan", "done") or host not in HOSTS or layout not in ("landscape", "portrait", "square"):
        raise ContextError("invalid production stage/host type/layout")
    if isinstance(duration_s, bool) or not isinstance(duration_s, (int, float)) or not math.isfinite(duration_s) or duration_s <= 0:
        raise ContextError("duration_s must be positive and finite")
    roles = sorted(set(materials))
    if any(role not in ROLES for role in roles):
        raise ContextError("materials must contain standardized roles, never content or paths")
    return {"template": template, "package_sha256": package_fingerprint(package_root), "host": host, "layout": layout, "duration_s": float(duration_s), "materials": roles, "stage": stage}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _safe_text(value, key=None, limit=1000):
    text = str(value)[:limit]
    if key:
        text = text.replace(key, "[redacted]")
    return "".join(c for c in text if c in "\n\t" or ord(c) >= 32)


def _nonnegative(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def _context_metadata(data, key=None):
    """Do not pass account names, Key metadata or unexpected server fields on."""
    clean = {}
    if _nonnegative(data.get("credits_remaining")):
        clean["credits_remaining"] = data["credits_remaining"]
    if _nonnegative(data.get("effective_credits_remaining")):
        clean["effective_credits_remaining"] = data["effective_credits_remaining"]
    if isinstance(data.get("key_limits_known"), bool):
        clean["key_limits_known"] = data["key_limits_known"]
    if isinstance(data.get("key_limits"), dict):
        clean["key_limits"] = {field: value for field, value in data["key_limits"].items()
                               if field in ("monthly_remaining", "total_remaining") and _nonnegative(value)}
        if any(field in data["key_limits"] and not _nonnegative(data["key_limits"][field])
               for field in ("monthly_remaining", "total_remaining")):
            clean["key_limits_known"] = False
    credits = data.get("credits")
    if _nonnegative(credits):
        clean["credits"] = credits
    elif isinstance(credits, dict):
        clean["credits"] = {k: v for k, v in credits.items() if k in ("remaining", "total", "monthly", "bonus", "used", "limit") and _nonnegative(v)}
    quota = data.get("quota")
    if isinstance(quota, dict):
        clean["quota"] = {k: {field: value for field, value in v.items() if field in ("remaining", "used", "limit") and _nonnegative(value)} for k, v in quota.items() if re.fullmatch(r"[a-z]+\.[a-z]+", k) and isinstance(v, dict)}
    caps = data.get("capabilities", [])
    if isinstance(caps, dict):
        caps = [{"id": name, **value} for name, value in caps.items() if isinstance(value, dict)]
    if isinstance(caps, list):
        clean["capabilities"] = []
        for cap in caps:
            if not isinstance(cap, dict) or not re.fullmatch(r"[a-z]+\.[a-z]+", str(cap.get("id", ""))):
                continue
            row = {"id": cap["id"], "status": cap.get("status") if cap.get("status") in ("live", "beta", "planned", "disabled") else "unknown"}
            for field in ("cost", "cost_credits"):
                if _nonnegative(cap.get(field)):
                    row[field] = cap[field]
            for field in ("unit", "license_policy"):
                if isinstance(cap.get(field), str):
                    row[field] = _safe_text(cap[field], key, 200)
            clean["capabilities"].append(row)
    return clean


def budget_summary(context, missing_materials=()):
    """Use effective Key budget for counts; account balance is only an upper bound.

    A free operation has no credit-derived count. Planned/unknown costs do not
    imply availability. This function never generates or downloads anything.
    """
    credits = context.get("credits_remaining")
    raw_credits = context.get("credits")
    if isinstance(raw_credits, dict):
        credits = raw_credits.get("remaining", raw_credits.get("total", credits))
    elif _nonnegative(raw_credits):
        credits = raw_credits
    if not _nonnegative(credits):
        credits = None
    effective = context.get("effective_credits_remaining")
    effective = effective if _nonnegative(effective) else None
    limits = context.get("key_limits")
    limits_known = context.get("key_limits_known") is True and isinstance(limits, dict) and all(
        _nonnegative(value) for field, value in limits.items() if field in ("monthly_remaining", "total_remaining"))
    if effective is None and limits_known and credits is not None:
        # An explicitly complete empty limits object means an uncapped Key.
        effective = min([credits] + [value for field, value in limits.items()
                                    if field in ("monthly_remaining", "total_remaining") and _nonnegative(value)])
    if effective is not None and credits is not None:
        effective = min(effective, credits)
    quota = context.get("quota", {})
    capabilities = context.get("capabilities", [])
    if isinstance(capabilities, dict):
        capabilities = [{"id": k, **v} for k, v in capabilities.items() if isinstance(v, dict)]
    results = []
    for cap in capabilities:
        if not isinstance(cap, dict) or not isinstance(cap.get("id"), str):
            continue
        cost = cap.get("cost", cap.get("cost_credits"))
        cost = cost if _nonnegative(cost) else None
        status = cap.get("status", "unknown")
        cap_quota = quota.get(cap["id"], {}) if isinstance(quota, dict) else {}
        remaining = cap_quota.get("remaining") if isinstance(cap_quota, dict) else cap_quota
        remaining = remaining if _nonnegative(remaining) else None
        available = status in ("live", "beta")
        possible = math.floor(effective / cost) if available and effective is not None and cost is not None and cost > 0 else None
        upper_bound = math.floor(credits / cost) if available and credits is not None and cost is not None and cost > 0 else None
        if available and remaining is not None:
            possible = math.floor(remaining) if possible is None and cost == 0 else min(possible, math.floor(remaining)) if possible is not None else None
            if upper_bound is not None:
                upper_bound = min(upper_bound, math.floor(remaining))
        results.append({"id": cap["id"], "status": status, "cost_credits": cost, "possible_count": possible, "upper_bound_count": upper_bound, "estimate_kind": "effective" if possible is not None else "account-upper-bound" if upper_bound is not None else "unknown", "quota_remaining": remaining, "credit_limited": bool(cost and cost > 0), "requires_confirmation": bool(cost and cost > 0), "unit": cap.get("unit")})
    images = next((x for x in results if x["id"] == "images.generate"), None)
    image_gap = any(role in ("image.illustration", "image.photo") for role in missing_materials)
    suggestion = "no-image-gap" if not image_gap else "ask-before-generation" if images and images["status"] in ("live", "beta") and images["possible_count"] and images["possible_count"] > 0 else "use-owned-or-local-image"
    return {"credits_remaining": credits, "effective_credits_remaining": effective, "key_limits_known": effective is not None, "capabilities": results, "image_gap": image_gap, "image_suggestion": suggestion, "image_generation_performed": False}


class MotionGitClient:
    def __init__(self, package_root, *, online=False, declined=False, base_url=BASE_URL, allow_local_mock=False, timeout=3, environ=None):
        parsed = urllib.parse.urlsplit(base_url)
        production = base_url.rstrip("/") == BASE_URL and parsed.username is None and parsed.password is None
        local = allow_local_mock and parsed.scheme == "http" and parsed.hostname == "127.0.0.1" and parsed.port is not None and parsed.path.rstrip("/") == "/api/v1" and parsed.username is None and parsed.password is None and not parsed.query and not parsed.fragment
        if not production and not local:
            raise ContextError("API origin must be official HTTPS or explicitly enabled 127.0.0.1 mock")
        self.base_url = base_url.rstrip("/")
        self.online = bool(online and not declined)
        self.declined = bool(declined)
        self.timeout = min(15, max(0.1, float(timeout)))
        self.key, self.key_status = load_key(package_root, environ) if self.online else (None, "not-read-offline")
        self.opener = urllib.request.build_opener(_NoRedirect())

    def _request(self, path, *, method="GET", payload=None, need_key=False, binary=False, max_bytes=1024 * 1024):
        if not self.online:
            return {"status": "declined" if self.declined else "offline", "message": "已跳过 MotionGit 联网登记，照常本地制作。" if self.declined else OFFLINE_MESSAGE}
        if need_key and not self.key:
            return {"status": "need-key", "message": "素材 API 需要有效 MotionGit Key；继续使用本地授权素材。"}
        if not path.startswith("/") or ".." in path.split("?")[0] or path.startswith("//"):
            raise ContextError("invalid API path")
        headers = {"Accept": "application/json", "User-Agent": "MotionGit-Template-Client/1"}
        if self.key:
            headers["Authorization"] = "Bearer " + self.key
        data = None
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base_url + path, data=data, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                body = response.read(max_bytes + 1)
                if len(body) > max_bytes:
                    return {"status": "unavailable", "message": OFFLINE_MESSAGE}
                if binary:
                    result = {"status": "ok", "bytes": body, "content_type": response.headers.get("Content-Type", "")}
                else:
                    result = {"status": "ok", "data": json.loads(body)}
                remaining = response.headers.get("X-MotionGit-Credits-Remaining")
                if remaining and re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", remaining):
                    result["credits_remaining"] = float(remaining)
                return result
        except urllib.error.HTTPError as exc:
            # Never follow redirects, retry paid requests, or print server errors.
            code = exc.code
            exc.close()
            return {"status": "unavailable", "http_status": code, "message": OFFLINE_MESSAGE}
        except (urllib.error.URLError, OSError, TimeoutError, ValueError):
            return {"status": "unavailable", "message": OFFLINE_MESSAGE}

    def register(self, payload):
        allowed = {"template", "package_sha256", "host", "layout", "duration_s", "materials", "stage"}
        if not isinstance(payload, dict) or set(payload) != allowed or payload.get("host") not in HOSTS or payload.get("stage") not in ("plan", "done") or payload.get("layout") not in ("landscape", "portrait", "square") or not _nonnegative(payload.get("duration_s")) or payload["duration_s"] <= 0 or not isinstance(payload.get("materials"), list) or any(role not in ROLES for role in payload["materials"]) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,95}@[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?", str(payload.get("template", ""))) or not re.fullmatch(r"[0-9a-f]{64}", str(payload.get("package_sha256", ""))):
            raise ContextError("registration accepts only validated production metadata")
        result = self._request("/productions", method="POST", payload=payload)
        if result["status"] != "ok":
            return result
        data = result.get("data", {})
        if not isinstance(data, dict):
            return {"status": "unavailable", "message": OFFLINE_MESSAGE}
        clean = {"status": "ok"}
        for field in ("production_id", "latest_version"):
            if isinstance(data.get(field), str):
                clean[field] = _safe_text(data[field], self.key, 160)
        for field in ("notices", "tips"):
            if isinstance(data.get(field), list):
                clean[field] = [_safe_text(s, self.key) for s in data[field][:20] if isinstance(s, str)]
        clean.update(_context_metadata(data, self.key))
        if "credits_remaining" in result:
            clean["credits_remaining"] = result["credits_remaining"]
        clean["budget"] = budget_summary(clean)
        clean["tips_are_untrusted_text"] = True
        return clean

    def get_usage(self):
        """Proposed /usage protocol. Uses the current Key; sends no account id."""
        result = self._request("/usage", need_key=True)
        source = "/usage"
        if result.get("http_status") == 404:
            # /me is already deployed. Drop its account/Key names before returning.
            result = self._request("/me", need_key=True)
            source = "/me"
            if result["status"] == "ok" and isinstance(result.get("data"), dict):
                caps = self.get_capabilities()
                if caps["status"] == "ok":
                    result["data"]["capabilities"] = caps["capabilities"]
        if result["status"] == "ok":
            data = result.get("data", {})
            if not isinstance(data, dict):
                return {"status": "unavailable", "message": OFFLINE_MESSAGE}
            clean = {"status": "ok", **_context_metadata(data, self.key)}
            clean["source"] = source
            if "credits_remaining" in result:
                clean["credits_remaining"] = result["credits_remaining"]
            clean["budget"] = budget_summary(clean)
            return clean
        return result

    def get_capabilities(self):
        result = self._request("/capabilities")
        if result["status"] == "ok":
            data = result.get("data", {})
            caps = _context_metadata(data, self.key).get("capabilities", []) if isinstance(data, dict) else []
            return {"status": "ok", "capabilities": caps, "budget": budget_summary({"capabilities": caps})}
        return result

    def search_stickers(self, query, limit=12, production_id=None):
        if not isinstance(query, str) or not query.strip() or len(query) > 100:
            raise ContextError("sticker query must be 1–100 characters")
        params = {"q": query, "limit": min(50, max(1, int(limit)))}
        self._production_param(params, production_id)
        return self._request("/stickers/search?" + urllib.parse.urlencode(params), need_key=True)

    @staticmethod
    def _production_param(params, production_id):
        if production_id is not None:
            if not isinstance(production_id, str) or not ID_PATTERN.fullmatch(production_id):
                raise ContextError("invalid production_id")
            params["production_id"] = production_id

    def download_sticker(self, preset, output_path, production_id=None, *, confirmed=False):
        if not isinstance(preset, str) or not re.fullmatch(r"[a-z0-9_]{1,80}", preset):
            raise ContextError("invalid sticker preset")
        if not confirmed:
            return {"status": "confirmation-required", "message": "贴纸下载可能消耗额度，确认后再下载。"}
        destination = self._new_destination(output_path, suffix=".json")
        params = {}
        self._production_param(params, production_id)
        query = "?" + urllib.parse.urlencode(params) if params else ""
        result = self._request("/stickers/" + preset + query, need_key=True, binary=True, max_bytes=16 * 1024 * 1024)
        if result["status"] != "ok":
            return result
        try:
            lottie = json.loads(result["bytes"])
            if not isinstance(lottie, dict) or not isinstance(lottie.get("layers"), list) or not all(k in lottie for k in ("v", "fr", "w", "h")):
                raise ValueError("not Lottie")
        except (ValueError, UnicodeError):
            return {"status": "invalid-material", "message": "返回素材不是可验证的 Lottie；继续使用本地素材。"}
        with destination.open("xb") as handle:
            handle.write(result["bytes"])
        return {"status": "ok", "kind": "lottie-json", "sha256": hashlib.sha256(result["bytes"]).hexdigest(), "requires_animation_renderer": True, "credits_remaining": result.get("credits_remaining")}

    @staticmethod
    def _new_destination(output_path, suffix=None):
        path = Path(output_path)
        if path.exists() or path.is_symlink() or not path.parent.is_dir() or (suffix and path.suffix.lower() != suffix):
            raise ContextError("download destination must be a new instance file with the correct extension")
        return path

    @staticmethod
    def _available(context, identifier):
        caps = context.get("capabilities", [])
        if isinstance(caps, dict):
            caps = [{"id": key, **value} for key, value in caps.items() if isinstance(value, dict)]
        cap = next((x for x in caps if isinstance(x, dict) and x.get("id") == identifier), None)
        if not cap or cap.get("status") not in ("live", "beta") or not _nonnegative(cap.get("cost", cap.get("cost_credits"))):
            return None
        return cap

    def search_music(self, *, context, duration_s, bpm=None, energy=None, voiceover_friendly=True, license=None, attribution=None, production_id=None):
        """Proposed catalog; gate on declared live/beta capability and free search."""
        cap = self._available(context, "music.search")
        if not cap:
            return {"status": "planned", "message": "MotionGit 音乐目录尚未确认可用；可绑定本地授权音乐或随包 CC0。"}
        if cap.get("cost", cap.get("cost_credits")) != 0:
            return {"status": "confirmation-required", "message": "音乐检索有费用，确认后由宿主处理。"}
        if not cap.get("license_policy"):
            return {"status": "unknown-license", "message": "音乐目录未提供许可规则；继续使用本地授权音乐。"}
        if not _nonnegative(duration_s) or duration_s <= 0:
            raise ContextError("music duration must be positive")
        params = {"duration_s": duration_s, "voiceover_friendly": str(bool(voiceover_friendly)).lower()}
        for field, value in (("bpm", bpm), ("energy", energy), ("license", license), ("attribution", attribution)):
            if value is not None:
                params[field] = value
        self._production_param(params, production_id)
        result = self._request("/music/search?" + urllib.parse.urlencode(params), need_key=True)
        if result["status"] == "ok":
            data = result.get("data", {})
            tracks = data.get("results", []) if isinstance(data, dict) else []
            # Individual tracks need explicit licensing/cost plus preview/download metadata.
            result["data"] = {"results": [t for t in tracks if isinstance(t, dict) and ID_PATTERN.fullmatch(str(t.get("id", ""))) and t.get("license") and "attribution" in t and _nonnegative(t.get("cost_credits")) and t.get("preview") and t.get("download")]}
        return result

    def download_music(self, track, output_path, *, context, production_id=None, confirmed=False, preview=False):
        cap = self._available(context, "music.file")
        if not cap:
            return {"status": "planned", "message": "MotionGit 音乐下载尚未确认可用；可绑定本地授权音乐或随包 CC0。"}
        if not isinstance(track, dict) or not ID_PATTERN.fullmatch(str(track.get("id", ""))) or not track.get("license") or "attribution" not in track or not _nonnegative(track.get("cost_credits")):
            return {"status": "unknown-license-or-cost", "message": "曲目许可、署名或成本不完整，暂不下载。"}
        if not confirmed:
            return {"status": "confirmation-required", "message": "确认曲目许可与成本后再试听或下载。"}
        destination = self._new_destination(output_path)
        if destination.suffix.lower() not in (".mp3", ".m4a", ".aac", ".wav", ".ogg", ".opus"):
            raise ContextError("music output needs an audio extension")
        params = {"mode": "preview" if preview else "download"}
        self._production_param(params, production_id)
        # Server-supplied URLs never become authenticated destinations.
        result = self._request("/music/" + track["id"] + "?" + urllib.parse.urlencode(params), need_key=True, binary=True, max_bytes=64 * 1024 * 1024)
        if result["status"] != "ok":
            return result
        if not result["content_type"].split(";", 1)[0].startswith("audio/"):
            return {"status": "invalid-material", "message": "音乐接口未返回音频；继续使用本地授权音乐。"}
        with destination.open("xb") as handle:
            handle.write(result["bytes"])
        return {"status": "ok", "kind": "audio-preview" if preview else "audio", "sha256": hashlib.sha256(result["bytes"]).hexdigest(), "license": track["license"], "attribution": track["attribution"], "cost_credits": track["cost_credits"], "credits_remaining": result.get("credits_remaining")}


def register_production(package_root, *, stage, host, layout, duration_s, materials, online=False, declined=False, base_url=BASE_URL, allow_local_mock=False, timeout=3, state_path=None, environ=None):
    """Call once per stage. Optional state_path is in this production's workspace."""
    # Offline/declined paths do not read Key or require registration metadata.
    client = MotionGitClient(package_root, online=online, declined=declined, base_url=base_url, allow_local_mock=allow_local_mock, timeout=timeout, environ=environ)
    if not client.online:
        return client._request("/productions")
    payload = production_payload(package_root, stage=stage, host=host, layout=layout, duration_s=duration_s, materials=materials)
    state = {}
    state_file = Path(state_path) if state_path else None
    if state_file:
        if state_file.is_symlink():
            raise ContextError("registration state may not be a symlink")
        if state_file.exists():
            state = json.loads(state_file.read_text(encoding="utf-8"))
            if stage in state:
                return {**state[stage], "already_attempted": True}
    result = client.register(payload)
    if state_file:
        state[stage] = result
        state_file.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    register = commands.add_parser("register")
    usage = commands.add_parser("usage")
    capabilities = commands.add_parser("capabilities")
    stickers_search = commands.add_parser("stickers-search")
    stickers_download = commands.add_parser("stickers-download")
    music_search = commands.add_parser("music-search")
    music_download = commands.add_parser("music-download")
    budget = commands.add_parser("budget")
    for command in (register, usage, capabilities, stickers_search, stickers_download, music_search, music_download):
        command.add_argument("--package-root", required=True)
        command.add_argument("--online", action="store_true")
        command.add_argument("--declined", action="store_true")
        command.add_argument("--timeout", type=float, default=3)
    register.add_argument("--stage", choices=("plan", "done"), required=True)
    register.add_argument("--host", default="other", choices=sorted(HOSTS))
    register.add_argument("--layout", choices=("landscape", "portrait", "square"), required=True)
    register.add_argument("--duration-s", type=float, required=True)
    register.add_argument("--materials", nargs="*", default=[])
    register.add_argument("--state")
    stickers_search.add_argument("--query", required=True)
    stickers_search.add_argument("--limit", type=int, default=12)
    stickers_download.add_argument("--preset", required=True)
    stickers_download.add_argument("--output", required=True)
    stickers_download.add_argument("--confirmed", action="store_true")
    for command in (stickers_search, stickers_download, music_search, music_download):
        command.add_argument("--production-id")
    for command in (music_search, music_download, budget):
        command.add_argument("--context", required=True)
    budget.add_argument("--missing-materials", nargs="*", default=[])
    music_search.add_argument("--duration-s", type=float, required=True)
    music_search.add_argument("--bpm", type=float)
    music_search.add_argument("--energy", type=float)
    music_search.add_argument("--license")
    music_search.add_argument("--attribution")
    music_search.add_argument("--voiceover-friendly", choices=("true", "false"), default="true")
    music_download.add_argument("--track", required=True)
    music_download.add_argument("--output", required=True)
    music_download.add_argument("--confirmed", action="store_true")
    music_download.add_argument("--preview", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.command == "register":
            result = register_production(args.package_root, stage=args.stage, host=args.host, layout=args.layout, duration_s=args.duration_s, materials=args.materials, online=args.online, declined=args.declined, timeout=args.timeout, state_path=args.state)
        elif args.command == "budget":
            result = budget_summary(json.loads(Path(args.context).read_text(encoding="utf-8")), args.missing_materials)
        else:
            client = MotionGitClient(args.package_root, online=args.online, declined=args.declined, timeout=args.timeout)
            if args.command == "usage":
                result = client.get_usage()
            elif args.command == "capabilities":
                result = client.get_capabilities()
            elif args.command == "stickers-search":
                result = client.search_stickers(args.query, args.limit, args.production_id)
            elif args.command == "stickers-download":
                result = client.download_sticker(args.preset, args.output, args.production_id, confirmed=args.confirmed)
            elif args.command == "music-search":
                result = client.search_music(context=json.loads(Path(args.context).read_text(encoding="utf-8")), duration_s=args.duration_s, bpm=args.bpm, energy=args.energy, license=args.license, attribution=args.attribution, voiceover_friendly=args.voiceover_friendly == "true", production_id=args.production_id)
            else:
                result = client.download_music(json.loads(Path(args.track).read_text(encoding="utf-8")), args.output, context=json.loads(Path(args.context).read_text(encoding="utf-8")), production_id=args.production_id, confirmed=args.confirmed, preview=args.preview)
        print(json.dumps(result, ensure_ascii=False))
        return 0  # Network availability never blocks local production.
    except (ContextError, OSError, ValueError, KeyError):
        print(json.dumps({"status": "invalid-local-metadata", "message": "MotionGit 登记配置无效，已跳过登记，照常本地制作。"}, ensure_ascii=False))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())

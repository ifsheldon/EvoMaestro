"""Narrow capabilities for a shared, anonymous mock evolution deployment."""

from __future__ import annotations

import json
import secrets
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from backend.datasets import GUIDE_ID, Dataset, DatasetRole
from fastapi import HTTPException
from pydantic import SecretStr


@dataclass(frozen=True)
class PublicDemoPolicy:
    """Authorize only one mutable mock database and one immutable guide."""

    root: Path
    demo: Path
    guide: Path
    callback_token: SecretStr

    @classmethod
    def create(
        cls, database: Path, search_root: Path, guide: Path, callback_token: str
    ) -> PublicDemoPolicy:
        """Reject unsupported public deployments before serving requests."""
        root = search_root.resolve()
        demo_path = database.resolve()
        guide_path = guide.resolve()
        if database.is_symlink() or guide.is_symlink():
            raise ValueError("Public demo databases must be regular files")
        if not demo_path.is_relative_to(root) or demo_path == guide_path:
            raise ValueError(
                "Public demo requires a separate database in its search root"
            )
        if len(callback_token) < 32:
            raise ValueError("Public demo requires a generated callback credential")
        for path, role in (
            (demo_path, DatasetRole.MOCK_DEMO),
            (guide_path, DatasetRole.MOCK_GUIDE),
        ):
            manifest = path.parent / "dataset.json"
            if not manifest.is_file() or manifest.is_symlink():
                raise ValueError(
                    "Public datasets require a regular dataset.json manifest"
                )
            try:
                manifest_role = DatasetRole(json.loads(manifest.read_text())["role"])
            except (ValueError, KeyError, TypeError) as exc:
                raise ValueError("Invalid public dataset manifest") from exc
            if manifest_role != role:
                raise ValueError(f"Public deployment requires a {role.value} dataset")
            dataset = Dataset.resolve(str(path), root, guide_path)
            if dataset.role != role:
                raise ValueError(f"Public deployment requires a {role.value} dataset")
            if path.suffix not in {".sqlite", ".db"}:
                raise ValueError("Public datasets must be SQLite program databases")
            try:
                with sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True) as conn:
                    conn.execute("SELECT id FROM programs LIMIT 0")
            except sqlite3.Error as exc:
                raise ValueError(
                    "Public datasets must contain a programs table"
                ) from exc
        return cls(root, demo_path, guide_path, SecretStr(callback_token))

    def resolve(self, value: str) -> Dataset:
        """Check the exact path allowlist before examining any requested file."""
        if value == GUIDE_ID:
            candidate = self.guide
        else:
            if value.startswith(f"{self.root.name}/"):
                value = value[len(self.root.name) + 1 :]
            requested = Path(value)
            if ".." in requested.parts:
                raise HTTPException(403, "Dataset is unavailable in the public demo")
            candidate = (self.root / requested).resolve()
        if candidate not in {self.demo, self.guide}:
            raise HTTPException(403, "Dataset is unavailable in the public demo")
        self.sidecar(candidate, Path("dataset.json"))
        dataset = Dataset.resolve(str(candidate), self.root, self.guide)
        expected = (
            DatasetRole.MOCK_DEMO if candidate == self.demo else DatasetRole.MOCK_GUIDE
        )
        if dataset.role != expected:
            raise HTTPException(403, "Public dataset capabilities changed")
        return dataset

    def require_callback(self, authorization: str | None) -> None:
        """Accept the server-only bearer credential without logging or returning it."""
        expected = f"Bearer {self.callback_token.get_secret_value()}"
        if authorization is None or not secrets.compare_digest(
            authorization.encode(), expected.encode()
        ):
            raise HTTPException(401, "Runner callback authentication required")

    def sidecar(self, database: Path, relative: Path) -> Path:
        """Allow only regular sidecar files confined to the authorized run directory."""
        if relative.is_absolute() or ".." in relative.parts:
            raise HTTPException(403, "Invalid dataset artifact")
        candidate = database.parent / relative
        cursor = database.parent
        for part in relative.parts:
            cursor /= part
            if cursor.is_symlink():
                raise HTTPException(403, "Dataset artifact must not be a symbolic link")
        if not candidate.resolve().is_relative_to(database.parent):
            raise HTTPException(403, "Dataset artifact is outside the run directory")
        if candidate.exists() and not candidate.is_file():
            raise HTTPException(403, "Dataset artifact must be a regular file")
        return candidate

    @property
    def demo_identity(self) -> str:
        """Return the selector identity without exposing the host filesystem root."""
        return f"{self.root.name}/{self.demo.relative_to(self.root)}"

    def listing(self) -> list[dict[str, str]]:
        """Expose only the mutable working run in ordinary dataset selection."""
        self.resolve(self.demo_identity)
        return [
            {
                "path": self.demo_identity,
                "name": "mock-demo",
                "sort_key": "0",
                "actual_path": str(self.demo.relative_to(self.root)),
            }
        ]

"""Resolve ordinary runs and the explicitly registered, immutable guide fixture."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from fastapi import HTTPException

GUIDE_ID = "examples/mock-guide/programs.sqlite"


class DatasetRole(StrEnum):
    """Supported dataset capabilities, recorded in dataset.json."""

    RUN = "run"
    MOCK_DEMO = "mock-demo"
    MOCK_GUIDE = "mock-guide"


@dataclass(frozen=True)
class Dataset:
    """A resolved database and its validated presentation capabilities."""

    path: Path
    role: DatasetRole
    example_summary_generation: int | None = None

    @classmethod
    def resolve(cls, value: str, search_root: Path, guide_path: Path) -> Dataset:
        """Resolve only search-root members or the explicitly configured guide."""
        root = search_root.resolve()
        guide = guide_path.resolve()
        if value == GUIDE_ID:
            path = guide
        else:
            if value.startswith(f"{root.name}/"):
                value = value[len(root.name) + 1 :]
            candidate = Path(value)
            if ".." in candidate.parts:
                raise HTTPException(400, "Invalid dataset path")
            path = (root / candidate).resolve()
            if not path.is_relative_to(root) and path != guide:
                raise HTTPException(
                    400, "Dataset is outside the configured search root"
                )
        if not path.is_file():
            raise HTTPException(404, "Dataset not found")
        role = DatasetRole.MOCK_GUIDE if path == guide else DatasetRole.RUN
        summary_generation = None
        manifest = path.parent / "dataset.json"
        if manifest.is_file():
            try:
                data = json.loads(manifest.read_text())
                manifest_role = DatasetRole(data["role"])
                if path != guide:
                    role = manifest_role
                summary_generation = data.get("example_summary_generation")
                if summary_generation is not None and (
                    type(summary_generation) is not int or summary_generation < 0
                ):
                    raise ValueError("Invalid example summary generation")
            except (ValueError, KeyError, TypeError) as exc:
                raise HTTPException(500, "Invalid dataset manifest") from exc
        return cls(path, role, summary_generation)

    @property
    def read_only(self) -> bool:
        """Whether writes and live generation are forbidden for this dataset."""
        return self.role == DatasetRole.MOCK_GUIDE

    def require_writable(self) -> None:
        """Reject a mutation before opening a writable database connection."""
        if self.read_only:
            raise HTTPException(403, "mock-guide is a read-only demonstration dataset")

    @property
    def maestro_chat_enabled(self) -> bool:
        """Allow subscription-backed chat only for ordinary experiment runs."""
        return self.role == DatasetRole.RUN

    def maestro_directory(self) -> Path:
        """Authorize chat and return its canonical working directory without writes."""
        if not self.maestro_chat_enabled:
            raise HTTPException(403, "Maestro Chat is disabled for this mock dataset")
        # A path to a config or source file must not impersonate an ordinary run.
        if self.path.suffix.lower() not in {".db", ".sqlite"}:
            raise HTTPException(400, "A program database is required")
        try:
            connection = sqlite3.connect(f"{self.path.as_uri()}?mode=ro", uri=True)
            try:
                connection.execute("SELECT id FROM programs LIMIT 0")
            finally:
                connection.close()
        except sqlite3.Error as exc:
            raise HTTPException(400, "A program database is required") from exc
        return self.path.parent

    def describe(self, client_path: str) -> dict[str, object]:
        """Return the public dataset identity and presentation capabilities."""
        return {
            "path": client_path,
            "role": self.role.value,
            "read_only": self.read_only,
            "maestro_chat_enabled": self.maestro_chat_enabled,
            "example_summary_generation": self.example_summary_generation,
        }

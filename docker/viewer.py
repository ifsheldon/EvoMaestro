"""Serve the bundled Shinka UI with requests confined to one immutable dataset."""

from __future__ import annotations

import argparse
import functools
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from http.server import ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

from shinka.webui import visualization

STATIC_PATHS = {
    "/",
    "/index.html",
    "/viz_tree.html",
    "/compare.html",
    "/favicon.png",
    "/sakana.jpg",
}
DATABASE_ROUTES = {
    "/get_programs",
    "/get_programs_summary",
    "/get_program_count",
    "/get_program_details",
    "/get_meta_files",
    "/get_meta_content",
    "/download_meta_pdf",
    "/get_plots",
    "/get_system_prompts",
    "/get_database_stats",
}


@dataclass(frozen=True)
class ViewerFiles:
    """An immutable, symlink-free dataset and its allowed program databases."""

    root: Path
    databases: frozenset[Path]

    @classmethod
    def from_directory(cls, directory: Path) -> ViewerFiles:
        """Validate the packaged tree before accepting any HTTP requests."""
        if directory.is_symlink() or not directory.is_dir():
            raise ValueError("Viewer dataset must be a regular directory")
        root = directory.resolve()
        for entry in root.rglob("*"):
            if entry.is_symlink():
                raise ValueError("Viewer datasets must not contain symlinks")
        databases = frozenset(root.rglob("programs.sqlite"))
        if not databases or any(not path.is_file() for path in databases):
            raise ValueError("Viewer dataset requires regular program databases")
        return cls(root, databases)

    def resolve(self, value: str) -> Path:
        """Parse a URL-provided relative path and enforce the dataset boundary."""
        relative = Path(value)
        if (
            not value
            or relative.is_absolute()
            or ".." in relative.parts
            or "\\" in value
        ):
            raise ValueError("Invalid dataset path")
        cursor = self.root
        for part in relative.parts:
            cursor /= part
            if cursor.is_symlink():
                raise ValueError("Dataset symlinks are unavailable")
        resolved = cursor.resolve()
        if not resolved.is_relative_to(self.root) or not resolved.is_file():
            raise ValueError("Dataset file is unavailable")
        return resolved

    def database(self, value: str) -> Path:
        """Accept only a database discovered inside this viewer's dataset."""
        resolved = self.resolve(value)
        if resolved not in self.databases:
            raise ValueError("Database is unavailable")
        return resolved


class PublicViewerHandler(visualization.DatabaseRequestHandler):
    """Apply a public read boundary before invoking the existing viewer handlers."""

    def __init__(self, *args: Any, files: ViewerFiles, **kwargs: Any) -> None:
        """Keep the dataset root separate from the package's static assets."""
        self.files = files
        super().__init__(
            *args,
            search_root=str(files.root),
            directory=str(Path(visualization.__file__).parent),
            **kwargs,
        )

    def _load_failed_proposal_nodes(
        self,
        abs_db_path: str,
        *,
        include_code: bool = False,
        generation: int | None = None,
    ) -> list[dict[str, Any]]:
        """Treat an absent attempt log in older snapshots as no recorded failures."""
        with closing(
            sqlite3.connect(Path(abs_db_path).as_uri() + "?mode=ro", uri=True)
        ) as connection:
            exists = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='attempt_log'"
            ).fetchone()
        if exists is None:
            return []
        return super()._load_failed_proposal_nodes(
            abs_db_path, include_code=include_code, generation=generation
        )

    def do_GET(self) -> None:
        """Reject arbitrary database, artifact, and static-file requests."""
        try:
            parsed = urlsplit(self.path)
            query = parse_qs(parsed.query, keep_blank_values=True, max_num_fields=16)
            if any(len(values) != 1 for values in query.values()):
                raise ValueError("Duplicate query fields are unavailable")
            if "db_path" in query:
                self.files.database(query["db_path"][0])
            for field in ("generation", "processed_count"):
                if field in query:
                    value = query[field][0]
                    if not value.isascii() or not value.isdecimal() or len(value) > 9:
                        raise ValueError("Invalid generation")
            if parsed.path in DATABASE_ROUTES:
                if "db_path" not in query:
                    raise ValueError("A database is required")
            elif parsed.path.startswith("/plot_file/"):
                plot = self.files.resolve(unquote(parsed.path[len("/plot_file/") :]))
                if plot.suffix.lower() not in {
                    ".png",
                    ".gif",
                    ".jpg",
                    ".jpeg",
                } or plot.parent.parts[-2:] != ("results", "plots"):
                    raise ValueError("Only plot images are available")
            elif parsed.path not in STATIC_PATHS | {"/list_databases"}:
                raise ValueError("Route is unavailable")
        except (OSError, ValueError):
            self.send_error(403, "Resource is unavailable in this public viewer")
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        """Keep the inherited static handler from exposing Python source files."""
        if urlsplit(self.path).path not in STATIC_PATHS:
            self.send_error(403, "Resource is unavailable in this public viewer")
            return
        if urlsplit(self.path).path == "/":
            self.path = "/index.html"
        super().do_HEAD()


def main() -> None:
    """Run a foreground server so Supervisor can detect and restart failures."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    files = ViewerFiles.from_directory(args.dataset)
    handler = functools.partial(PublicViewerHandler, files=files)
    with ThreadingHTTPServer(("0.0.0.0", args.port), handler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()

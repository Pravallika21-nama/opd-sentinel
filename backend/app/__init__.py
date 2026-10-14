"""OPD Sentinel HTTP application."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("opd-sentinel")
except PackageNotFoundError:
    __version__ = "0.1.0"

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Seed code reuses the API's constants and ML (taste assertions) without packaging api/.
sys.path.insert(0, str(ROOT / "api"))

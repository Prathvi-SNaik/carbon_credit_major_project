from __future__ import annotations
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run(args):
    print("+", " ".join(args))
    subprocess.check_call(args, cwd=ROOT)


def main():
    train = ROOT / "data" / "processed" / "training_table.parquet"
    raw_any = list((ROOT / "data" / "raw").glob("wosis_orgc_*.csv"))
    if not raw_any:
        run([sys.executable, "data/collect_wosis.py"])
    if not train.exists():
        run([sys.executable, "preprocessing/clean_and_merge.py"])
    run([sys.executable, "training/train_models.py"])


if __name__ == "__main__":
    main()

"""Print the committed experiment table. Does not invent metrics."""

from pathlib import Path
import pandas as pd

p = Path(__file__).resolve().parents[1] / "models" / "experiment_results.csv"
print(pd.read_csv(p).to_string(index=False))

"""Bounded shutdown of only the kernel-pinned process verified by this task's record."""
import json
from pathlib import Path
from process_control import stop_recorded

if __name__ == '__main__':
    print(json.dumps(stop_recorded(Path(__file__).resolve().parent)))

"""Replace this wrapper with a command without inherited application credentials."""
import os
import sys
from environment import ROOT, clean_environment

if len(sys.argv) < 2:
    raise SystemExit('Usage: python run-clean.py command [args...]')
environment = clean_environment()
os.chdir(ROOT)
# Exec preserves the PID and signal target: the wrapper cannot strand a launcher.
os.execvpe(sys.argv[1], sys.argv[1:], environment)

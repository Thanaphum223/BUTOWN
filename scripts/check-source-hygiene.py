#!/usr/bin/env python3
"""Reject generated/private tracked files and recognizable credentials without printing them."""
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
forbidden_parts = {'node_modules', 'target', 'dist', 'work', 'private-files'}
patterns = [
    re.compile(rb'-----BEGIN ' + rb'(?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(rb'\bgh[opusr]_[A-Za-z0-9]{30,}\b'),
    re.compile(rb'\bAKIA[0-9A-Z]{16}\b'),
]
problems = []
for name in filter(None, tracked):
    path = Path(name)
    if forbidden_parts.intersection(path.parts) or (path.name.startswith('.env') and path.name != '.env.example'):
        problems.append(name + ': private/generated file is tracked')
        continue
    data = (root / path).read_bytes()
    if b'\0' in data:
        continue
    for number, line in enumerate(data.splitlines(), 1):
        if any(pattern.search(line) for pattern in patterns):
            problems.append(f'{name}:{number}: credential-like content (redacted)')
if problems:
    print('\n'.join(problems))
    sys.exit(1)
print('Source hygiene passed: no tracked environment/private/generated files or recognized credentials')

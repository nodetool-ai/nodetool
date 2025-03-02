#!/usr/bin/env python
import os
import sys
import subprocess

# Add the nodetool-replicate directory to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
replicate_dir = os.path.join(current_dir, "nodetool-replicate")
sys.path.insert(0, replicate_dir)

# Run the gencode.py script
gencode_path = os.path.join(
    replicate_dir, "src", "nodetool", "nodes", "replicate", "gencode.py"
)
print(f"Running: {gencode_path}")
subprocess.run([sys.executable, gencode_path])

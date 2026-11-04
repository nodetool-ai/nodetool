"""Assemble the pinned CUDA wheel headers and runtime for AOTInductor builds."""
import argparse
from pathlib import Path
import sysconfig


def prepare(destination):
    site = Path(sysconfig.get_paths()['purelib']) / 'nvidia'
    root = Path(destination).resolve()
    for source in (site / 'cuda_runtime/include', site / 'cuda_nvcc/include', site / 'cuda_cccl/include'):
        if not source.is_dir():
            raise RuntimeError(f'Missing CUDA build headers: {source}. Install requirements.txt.')
        for entry in source.rglob('*'):
            relative = entry.relative_to(source)
            target = root / 'include' / relative
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            elif not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                target.symlink_to(entry)
    library = site / 'cuda_runtime/lib/libcudart.so.12'
    if not library.is_file():
        raise RuntimeError(f'Missing CUDA runtime: {library}')
    (root / 'lib64').mkdir(parents=True, exist_ok=True)
    link = root / 'lib64/libcudart.so'
    if not link.exists():
        link.symlink_to(library)
    return root


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    print(prepare(parser.parse_args().destination))

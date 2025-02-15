import subprocess
from pathlib import Path


def export_requirements():
    # Create scripts directory if it doesn't exist
    output_dir = Path("requirements")
    output_dir.mkdir(exist_ok=True)

    # Define groups to export
    groups = ["ai", "data_science"]

    # Export main requirements
    subprocess.run(
        [
            "poetry",
            "export",
            "-f",
            "requirements.txt",
            "--only",
            "main",
            "--without-hashes",
            "-o",
            str(output_dir / "requirements.txt"),
        ]
    )

    # Export group requirements
    for group in groups:
        subprocess.run(
            [
                "poetry",
                "export",
                "-f",
                "requirements.txt",
                "--with",
                group,
                "--without-hashes",
                "-o",
                str(output_dir / f"requirements_{group}.txt"),
            ]
        )


if __name__ == "__main__":
    export_requirements()

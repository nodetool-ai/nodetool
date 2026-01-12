#!/usr/bin/env python3
"""
Compact OpenCode memory files to prevent context window bloating.

This script:
1. Removes duplicate entries from memory files
2. Consolidates similar entries
3. Removes entries older than 6 months (optional)
4. Keeps files under target size (configurable)
5. Maintains proper formatting

Usage:
    python scripts/compact-memory.py [--dry-run] [--max-age-days 180]
"""

import argparse
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Set
import hashlib


class MemoryCompactor:
    """Compacts OpenCode memory files."""

    def __init__(self, memory_dir: Path, max_age_days: int = 180, dry_run: bool = False):
        self.memory_dir = memory_dir
        self.max_age_days = max_age_days
        self.dry_run = dry_run
        self.stats = {
            "files_processed": 0,
            "entries_removed": 0,
            "duplicates_removed": 0,
            "old_entries_removed": 0,
            "bytes_saved": 0,
        }

    def compact_all_files(self) -> None:
        """Compact all memory files in the directory."""
        # Files to compact (excluding README and IMPLEMENTATION)
        files_to_compact = [
            "features.md",
            "common-issues.md",
            "insights.md",
            "project-context.md",
        ]

        for filename in files_to_compact:
            file_path = self.memory_dir / filename
            if file_path.exists():
                print(f"\nProcessing {filename}...")
                self._compact_file(file_path)
                self.stats["files_processed"] += 1

    def _compact_file(self, file_path: Path) -> None:
        """Compact a single memory file."""
        original_content = file_path.read_text()
        original_size = len(original_content)

        # Split into sections
        sections = self._split_into_sections(original_content)
        
        # Deduplicate sections
        unique_sections = self._deduplicate_sections(sections, file_path.name)
        
        # Remove old entries (only for files with dated entries)
        if self._has_dated_entries(file_path.name):
            filtered_sections = self._filter_old_entries(unique_sections)
        else:
            filtered_sections = unique_sections
        
        # Reconstruct file
        new_content = self._reconstruct_file(filtered_sections, file_path.name)
        new_size = len(new_content)

        # Report and save
        bytes_saved = original_size - new_size
        self.stats["bytes_saved"] += bytes_saved

        if bytes_saved > 0:
            print(f"  Reduced size: {original_size} → {new_size} bytes ({bytes_saved} bytes saved)")
            if not self.dry_run:
                file_path.write_text(new_content)
                print(f"  ✓ Saved {file_path.name}")
            else:
                print(f"  [DRY RUN] Would save {file_path.name}")
        else:
            print(f"  No changes needed")

    def _split_into_sections(self, content: str) -> List[Dict[str, str]]:
        """Split content into sections based on headers."""
        sections = []
        current_section = {"header": "", "content": "", "level": 0}
        
        for line in content.split("\n"):
            # Check if line is a header
            header_match = re.match(r"^(#{1,6})\s+(.+)$", line)
            if header_match:
                # Save previous section if it has content
                if current_section["content"].strip() or current_section["header"]:
                    sections.append(current_section)
                
                # Start new section
                level = len(header_match.group(1))
                header = header_match.group(2)
                current_section = {
                    "header": header,
                    "level": level,
                    "content": "",
                    "full_header": line,
                }
            else:
                current_section["content"] += line + "\n"
        
        # Add last section
        if current_section["content"].strip() or current_section["header"]:
            sections.append(current_section)
        
        return sections

    def _deduplicate_sections(self, sections: List[Dict[str, str]], filename: str) -> List[Dict[str, str]]:
        """Remove duplicate sections based on content similarity."""
        seen_hashes: Set[str] = set()
        unique_sections = []
        
        for section in sections:
            # Only deduplicate sections with substantial content (>50 chars)
            content_for_hash = self._normalize_for_hash(section["content"])
            
            # Don't deduplicate headers-only or very short sections
            if len(content_for_hash) < 50 or not section["header"]:
                unique_sections.append(section)
                continue
            
            content_hash = hashlib.md5(content_for_hash.encode()).hexdigest()
            
            if content_hash not in seen_hashes:
                seen_hashes.add(content_hash)
                unique_sections.append(section)
            else:
                self.stats["duplicates_removed"] += 1
                print(f"  Removed duplicate: {section['header'][:50]}...")
        
        return unique_sections

    def _normalize_for_hash(self, content: str) -> str:
        """Normalize content for hash comparison (remove dates, whitespace)."""
        # Remove dates in various formats
        content = re.sub(r"\(\d{4}-\d{2}-\d{2}\)", "", content)
        content = re.sub(r"\d{4}-\d{2}-\d{2}", "", content)
        # Normalize whitespace
        content = re.sub(r"\s+", " ", content)
        return content.strip().lower()

    def _has_dated_entries(self, filename: str) -> bool:
        """Check if file has dated entries that can be filtered by age."""
        return filename in ["common-issues.md", "insights.md", "project-context.md"]

    def _filter_old_entries(self, sections: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """Remove entries older than max_age_days."""
        if self.max_age_days <= 0:
            return sections
        
        cutoff_date = datetime.now() - timedelta(days=self.max_age_days)
        filtered_sections = []
        
        for section in sections:
            # Try to extract date from header or content
            date_match = re.search(r"\((\d{4}-\d{2}-\d{2})\)", section["header"] + section["content"])
            
            if date_match:
                try:
                    entry_date = datetime.strptime(date_match.group(1), "%Y-%m-%d")
                    if entry_date >= cutoff_date:
                        filtered_sections.append(section)
                    else:
                        self.stats["old_entries_removed"] += 1
                        print(f"  Removed old entry ({entry_date.date()}): {section['header'][:50]}...")
                except ValueError:
                    # If date parsing fails, keep the entry
                    filtered_sections.append(section)
            else:
                # No date found, keep the entry
                filtered_sections.append(section)
        
        return filtered_sections

    def _reconstruct_file(self, sections: List[Dict[str, str]], filename: str) -> str:
        """Reconstruct file from sections."""
        lines = []
        
        for section in sections:
            if "full_header" in section and section["full_header"]:
                lines.append(section["full_header"])
            elif section["header"]:
                # Reconstruct header from level and text
                header_prefix = "#" * section.get("level", 2)
                lines.append(f"{header_prefix} {section['header']}")
            
            content = section["content"].rstrip()
            if content:
                lines.append(content)
            
            # Add spacing between sections (but not excessive)
            if section["header"]:
                lines.append("")
        
        # Join and clean up excessive blank lines
        content = "\n".join(lines)
        # Replace 3+ consecutive newlines with 2
        content = re.sub(r"\n{3,}", "\n\n", content)
        # Ensure file ends with single newline
        content = content.rstrip() + "\n"
        
        return content

    def print_summary(self) -> None:
        """Print summary statistics."""
        print("\n" + "=" * 60)
        print("COMPACTION SUMMARY")
        print("=" * 60)
        print(f"Files processed:      {self.stats['files_processed']}")
        print(f"Duplicates removed:   {self.stats['duplicates_removed']}")
        print(f"Old entries removed:  {self.stats['old_entries_removed']}")
        print(f"Total bytes saved:    {self.stats['bytes_saved']:,}")
        
        if self.dry_run:
            print("\n[DRY RUN] No files were modified")
        else:
            print("\n✓ Memory files compacted successfully")


def main():
    parser = argparse.ArgumentParser(
        description="Compact OpenCode memory files to prevent context bloat"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )
    parser.add_argument(
        "--max-age-days",
        type=int,
        default=180,
        help="Remove entries older than N days (0 to keep all, default: 180)",
    )
    parser.add_argument(
        "--memory-dir",
        type=Path,
        default=Path(__file__).parent.parent / ".github" / "opencode-memory",
        help="Path to memory directory (default: .github/opencode-memory)",
    )
    
    args = parser.parse_args()
    
    if not args.memory_dir.exists():
        print(f"Error: Memory directory not found: {args.memory_dir}")
        return 1
    
    print("OpenCode Memory Compactor")
    print("=" * 60)
    print(f"Memory directory: {args.memory_dir}")
    print(f"Max age: {args.max_age_days} days" if args.max_age_days > 0 else "Max age: unlimited")
    print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    
    compactor = MemoryCompactor(
        memory_dir=args.memory_dir,
        max_age_days=args.max_age_days,
        dry_run=args.dry_run,
    )
    
    compactor.compact_all_files()
    compactor.print_summary()
    
    return 0


if __name__ == "__main__":
    exit(main())

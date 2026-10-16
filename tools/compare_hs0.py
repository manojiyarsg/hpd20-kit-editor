#!/usr/bin/env python3
"""Read-only, streaming comparator for HPD-20 .HS0 backups.

Usage: python3 tools/compare_hs0.py BKUP-009.HS0 BKUP-010.HS0
Never edits either input file. Reports all changes outside the trailing MD5.
"""
import argparse
import hashlib
import mmap
from pathlib import Path

KIT_OFFSET = 6922
KIT_SIZE = 224
KITS_COUNT = 200
PAD_OFFSET = 51596
PAD_SIZE = 68
PADS_PER_KIT = 17
CHUNK = 1024 * 1024

def checksum(mm):
    digest = hashlib.md5()
    for offset in range(0, len(mm) - 16, CHUNK):
        digest.update(mm[offset:min(offset + CHUNK, len(mm) - 16)])
    return digest.digest() == mm[-16:]

def region(offset):
    if KIT_OFFSET <= offset < KIT_OFFSET + KIT_SIZE * KITS_COUNT:
        index, relative = divmod(offset - KIT_OFFSET, KIT_SIZE)
        return f"kit block {index + 1}, +{relative}"
    pad_end = PAD_OFFSET + PAD_SIZE * PADS_PER_KIT * KITS_COUNT
    if PAD_OFFSET <= offset < pad_end:
        index, relative = divmod(offset - PAD_OFFSET, PAD_SIZE * PADS_PER_KIT)
        pad, field = divmod(relative, PAD_SIZE)
        return f"pad block kit {index + 1}, pad {pad + 1}, +{field}"
    return "other/metadata (not mapped)"

def compare(left, right):
    with left.open("rb") as fa, right.open("rb") as fb:
        a = mmap.mmap(fa.fileno(), 0, access=mmap.ACCESS_READ)
        b = mmap.mmap(fb.fileno(), 0, access=mmap.ACCESS_READ)
        try:
            print(f"{left.name}: {len(a)} bytes, MD5 valid: {checksum(a)}")
            print(f"{right.name}: {len(b)} bytes, MD5 valid: {checksum(b)}")
            if len(a) != len(b):
                print("WARNING: different backup lengths; offsets may not be comparable")
            count = 0
            for start in range(0, min(len(a), len(b)) - 16, CHUNK):
                end = min(start + CHUNK, min(len(a), len(b)) - 16)
                aa, bb = a[start:end], b[start:end]
                if aa == bb:
                    continue
                for j, (old, new) in enumerate(zip(aa, bb)):
                    if old != new:
                        i = start + j
                        print(f"{i:>9}  {old:>3} -> {new:<3}  {region(i)}")
                        count += 1
            print(f"Total changed body bytes: {count}")
        finally:
            a.close()
            b.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    args = parser.parse_args()
    compare(args.before, args.after)

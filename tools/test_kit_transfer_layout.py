#!/usr/bin/env python3
"""Regression test for research HK02 logical kit slices against real HS0 backup.

Usage: python3 tools/test_kit_transfer_layout.py /path/to/BKUP-009.HS0
Read-only: never writes the backup or a patched backup to disk.
"""
import argparse
import hashlib
from pathlib import Path

KIT_OFFSET, KIT_STRIDE, KIT_HEAD = 6922, 224, 98
MFX_START, MFX_LEN = 99, 120
PAD_OFFSET, PAD_SIZE, PADS = 51596, 68, 17
KITS = 200

def regions(index):
    kit = KIT_OFFSET + index * KIT_STRIDE
    return [(kit, KIT_HEAD), (kit - KIT_STRIDE + MFX_START, MFX_LEN)] + [
        (PAD_OFFSET + (index * PADS + pad) * PAD_SIZE, PAD_SIZE)
        for pad in range(PADS)
    ]

def get(data, index):
    return [bytes(data[off:off + size]) for off, size in regions(index)]

def put(data, index, parts):
    for (off, size), part in zip(regions(index), parts):
        assert len(part) == size
        data[off:off + size] = part

def test(source):
    original = source.read_bytes()
    assert len(original) == 66898444, "Test fixture must be firmware 1.04 HS0"
    assert hashlib.md5(original[:-16]).digest() == original[-16:], "Bad fixture MD5"
    for from_kit, to_kit in [(100, 106), (0, 199), (199, 0), (1, 2), (50, 51)]:
        data = bytearray(original)
        payload = get(data, from_kit)
        put(data, to_kit, payload)
        assert get(data, to_kit) == payload
        allowed = {pos for off, length in regions(to_kit) for pos in range(off, off + length)}
        changed = {i for i, (a, b) in enumerate(zip(original, data)) if a != b}
        assert changed <= allowed, (from_kit, to_kit, changed - allowed)
        for other in range(KITS):
            if other != to_kit:
                assert get(data, other) == get(original, other), (
                    from_kit, to_kit, other
                )
        print(f"PASS: kit {from_kit+1} -> {to_kit+1}: {len(changed)} changes, no other logical kit modified")
    print("PASS: all selected boundary and cross-kit cases")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backup", type=Path)
    test(parser.parse_args().backup)

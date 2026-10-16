# Kit 12 → Tamil backup: verified sample relocation blockers

Analysis date: 2026-10-16. Input files: `BKUP-1002.HS0` (Hindi, 62,310,784 bytes), `BKUP-002(1).HS0` (Tamil, 64,145,848 bytes). Both have valid trailing MD5 checksums.

Source kit 12 (`Dholak-Tabla`) references 14 user-instrument candidates: 900, 909, 910, 914, 955, 959, 980, 983, 984, 985, 986, 988, 989, 994. The metadata records at `236300 + 56 * instrument_id` differ for **all 14 IDs** between backups. **11 of the 14 IDs are referenced by at least one Tamil kit**, so overwriting existing IDs is demonstrably unsafe.

The Tamil backup contains 241 candidate empty metadata records (reference bytes 32..47 all FF and not referenced by any pad); the first 14 are 1107..1120. This is **not** proof of empty audio storage or valid allocation, and these IDs must not yet be used for automatic import.

Destination kit 150 is named `Poattu vaith`, not empty. It must not be overwritten automatically.

## Blocking conditions before a restore-ready backup

1. Independently verify sample data offsets, lengths, format and metadata linkage for the source's 14 sample candidates.
2. Verify the destination sample allocator, sufficient free audio storage, and all shared references across kits.
3. Implement transactional sample copy and patch both layers' instrument references in the destination kit, while retaining all other Tamil kit references and audio unchanged.
4. Validate complete effects and kit parameter layout across the different-size backups.
5. Build, run regression tests, and perform a controlled HPD-20 hardware restore/playback check.

**Safety decision:** fail closed. No merged HS0 is generated, and no sample-copy or kit-import operation should be enabled until the blockers are resolved. Read-only preflight is supported.

## Reproducible audit

For each of the 14 instrument IDs, compare 56 bytes at offset `236300 + 56 * id` in both backups. Iterate the 200 kits × 17 pads × 2 layers and read the big-endian instrument ID at `51596 + 68 * (kit * 17 + pad) + 4 + 2 * layer`. Count destination references to each of the 14 IDs. Verify `MD5(file[:-16]) == file[-16:]` for both backups.

These offsets and sample classifications are reverse-engineering hypotheses and require hardware validation.

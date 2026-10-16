# HPD-20 kit transfer: verified findings and release blockers

## Source backups
BKUP-006 through BKUP-011 are 66,898,444 bytes each and their trailing 16 bytes exactly match MD5(body). BKUP-002 is 64,145,848 bytes (older version), and should not be treated as byte-for-byte layout-compatible without separate verification.

## Controlled experiments (zero-based absolute byte offsets)
- 006 -> 007: MFX1 Stereo Delay -> Compressor in kit 101: type at 29376 (+54), with additional parameter changes at 29197..29225 and 29389.
- 007 -> 008: MFX2 THRU -> Stereo Delay in kit 101: type at 29377 (+55), with parameter changes at 29239..29265 and 29391.
- 008 -> 009: MFX3 THRU -> Equalizer in kit 101: type at 29378 (+56), with parameter changes at 29279..29297.
- 009 -> 010: Kit 107 Ambience Level 100 -> 99: byte 30705 (+39) changes 100 -> 99. Also header/metadata bytes changed.
- 010 -> 011: Kit 107 Character -7 -> -6 and Level 99 -> 100: byte 30701 (+35) changes 6 -> 5; byte 30705 (+39) changes 99 -> 100. Character's complete value encoding remains unknown.

## Critical unresolved structural issue
The current codec assumes KIT_OFFSET=6922, KIT_SIZE=224. Under that layout, kit 100 starts at 29098 and kit 101 starts at 29322.

The controlled *kit 101* MFX parameter changes at 29197, 29239, 29279 are inside **kit 100's nominal 224-byte block** (+99, +141, +181). Therefore the current 1380-byte standalone kit format (224 kit bytes + 17 x 68 pad bytes) is not proven to preserve all of kit 101's MFX settings.

Do not blindly expand the copied kit region to include the preceding kit's bytes: that may overwrite unrelated kit 100 settings. The precise ownership and layout of MFX parameter storage must be independently established before enabling full kit import/export.

## Additional unverified fields
Ambience Type, Size, Wall Type, Shape, Ambience sends, kit EQ enable/parameters, and full MFX parameter ownership remain unverified. Matching a displayed value to an arbitrary byte is not enough evidence.

## Safe release criteria
1. Confirm ownership of every copied byte and test transfer from one source slot to a different destination slot.
2. Verify MFX1-3 types **and** parameter values, Ambience, EQ, all 17 pad blocks, and non-effect kit data on device.
3. Assert unrelated kits, global/system bytes and other metadata remain unchanged, except explicitly required checksum/selection metadata.
4. Test 1.04 backups independently from the 1.03 format.
5. Preserve backup originals and perform restore only after an independent backup.

Use tools/compare_hs0.py to inspect future controlled comparisons without loading ~67 MB into model context.

## Additional cross-kit structural evidence (BKUP-009)
The kit 100 nominal block (base 29098) contains three MFX parameter regions starting near +99, +139 and +179, while the MFX types for kit 101 are at kit 101 base 29322 +54/+55/+56. In kit 101's nominal block the +99..+218 region is zero, consistent with kit 102 having all three MFX types set to THRU (0,0,0). In kit 106's nominal block (kit 107's predecessor), +99..+218 contains substantial parameter data, while kit 107 types are (1,13,12). These are strong structural clues that MFX parameters for kit N are stored in the tail of the nominal block for kit N-1.

Do NOT assume the entire +99..+218 range is safe to transfer yet. The precise slot boundaries, kit 1 edge case, and 5-byte tail (+219..+223) need validation. The 224-byte copy currently used by importKit can inadvertently overwrite the following kit's MFX parameters. No hardware-tested import or safe complete-kit patch has been released.

## Experimental isolated transfer implementation (HK02; research branch)
Further inspection of BKUP-009 shows nominal +98 is zero in kits 1–199, while kit 200 +98 overlaps the first byte of the pad section (absolute 51596). Thus **only +0..+97 (98 bytes)** should be copied as kit header. The kit's MFX data is provisionally assigned to the preceding record's +99..+218 (120 bytes). Record +219..+223 is the constant marker `2a 00 16 00 2c`. Kit 1's MFX area resides in the prelude before kit 1; its full ownership remains a hypothesis.

The research branch changes backup.ts to use versioned HK02 blobs: 4-byte magic, 4-byte original backup size, 98-byte kit header, 120-byte MFX region, 17 x 68-byte pad blocks. Old 1380-byte .kit files are rejected instead of silently importing with the incorrect ownership. Cross-firmware imports with different backup lengths are rejected.

Local read-only regression testing with BKUP-009 passed five simulated transfers (101->107, 1->200, 200->1, 2->3, 51->52), verifying every logical kit other than the destination remains byte-identical. See tools/test_kit_transfer_layout.py. These tests are **not a hardware validation**; full MFX ownership, sound samples/user instruments, compatibility, and exact playback must still be checked before production use. Do not restore generated experimental files to hardware without a complete original backup and a dedicated test plan.

## Cross-backup sample-aware import: implementation status
- A **read-only** Cross-Backup Transfer Lab now loads a second backup, validates its MD5, selects source/destination kit slots, and exports an instrument-reference preflight report. It intentionally cannot create an import backup yet.
- The factory sound-list maps IDs 0..848; 849 is Off. IDs >849 are **user-instrument candidates**. Their sample contents, storage layout and slot mapping are not yet verified.
- Using BKUP-009, kit 12 contains 17 distinct instrument IDs and 21 active pad-layer references, all in the factory range (highest ID 752). Kit 101 has 18 distinct instrument IDs, including IDs up to 1044. Across all 200 kits in BKUP-009, 176 distinct IDs in the candidate user range 850..1044 are referenced by 65 kits. This is evidence that copying just kit bytes cannot guarantee an identical kit when user samples are involved.
- BKUP-006/009/011 have identical counts of 176 distinct referenced candidate user IDs; the source file data cannot yet prove whether they are populated or equivalent samples.
- On a local BKUP-009 test, six simulated isolated kit transfers (12→150, 101→107, 1→200, 200→1, 2→3, 51→52) passed checks that every other kit's designated logical byte regions stayed identical. This does **not** establish device sound equivalence or sample safety.
- No RIFF/WAVE container header is present in BKUP-009; WAV extraction/copy cannot be implemented by blindly copying ordinary RIFF chunks.
- The test lab has not been subjected to a full npm/TypeScript build in this environment; the Mac DMG is not ready.

### Remaining release blockers
1. Reverse engineer or obtain a trustworthy specification for sample metadata, sample bytes, reference tables and storage allocation in HS0.
2. Establish a collision-safe destination allocation strategy, including free-space and shared-sample detection.
3. Implement atomic sample copy + reference remapping + complete kit effects/pads transfer and prove untouched destination kits/samples are unchanged.
4. Build, lint and test the desktop app; validate one controlled restore on HPD-20 hardware.

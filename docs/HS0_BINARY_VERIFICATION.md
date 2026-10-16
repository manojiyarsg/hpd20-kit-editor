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

// Binary layout of the Roland HPD-20 backup file (BKUP-XXX.HS0).
// These offsets/sizes are factual properties of an interoperability file format,
// independently verified against a real 12,632,980-byte backup:
//  - last 16 bytes = MD5 over the rest (confirmed exact match)
//  - kit names readable at KIT_OFFSET, pad data verified at PAD_OFFSET
//  - layer modes / fade point confirmed against the owner's manual

export const MD5_SIZE = 16;

export const KIT_OFFSET = 6922;
export const KIT_SIZE = 224;
export const KITS_COUNT = 200;

export const PAD_OFFSET = 51596;
export const PAD_SIZE = 68;
export const PADS_PER_KIT = 17;

export const CHAIN_OFFSET = 1180;
export const CHAIN_SIZE = 128;
export const CHAINS_COUNT = 15;

// Single-kit export blob: one kit block followed by its 17 pad blocks.
export const KIT_FILE_SIZE = KIT_SIZE + PADS_PER_KIT * PAD_SIZE; // 1380

// Physical pad order as stored in the file.
export const PAD_NAMES = [
  "M1", "M2", "M3", "M4", "M5",
  "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8",
  "D-Beam", "Head", "Rim", "HH",
] as const;

export type PadName = (typeof PAD_NAMES)[number];

// Field offsets inside a 224-byte kit block.
export const KitField = {
  NAME: 2, // 12 chars, space-padded
  NAME_LEN: 12,
  SUBNAME: 14, // 16 chars
  SUBNAME_LEN: 16,
  VOLUME: 30,
  HH_VOLUME: 31,
  // Verified by controlled BKUP-009 -> BKUP-010 change: Kit 107
  // MENU > FX > AMBIENCE > EDIT > Level 100 -> 99 changed only
  // the kit-local byte at +39 (absolute 30705), apart from backup metadata.
  AMBIENCE_LEVEL: 39,
  SENSITIVITY: 55,
  BALANCE: 67,
} as const;

// Field offsets inside a 68-byte pad block. Layered fields add `layer` (0/1).
export const PadField = {
  VOLUME: 0, // +layer
  AMBIENCE: 2,
  PATCH: 4, // uint16, +layer*2  (instrument number)
  PATCH_INTERNAL: 8, // uint16, +layer*2
  PITCH: 12, // int16 cents, +layer*2
  MUFFLING: 16, // +layer
  PAN: 18, // signed int8, +layer
  COLOR: 23, // +layer
  MFX_ASSIGN: 25, // +layer
  SWEEP: 27, // +layer
  MIDI_NOTE: 33,
  MIDI_GATE: 34,
  SEND_ALL_PADS: 36,
  SEND_TO_KIT: 37,
  REC_PITCH: 39,
  MUTE: 40,
  RT_PITCH: 41,
  ROLL: 42,
  LAYER: 43,
  FADE_VALUE: 44,
  TRIGGER: 45,
  FIX_VELOCITY: 47,
  FIX_GROUP: 48,
  MONO_POLY: 49,
} as const;

export const LAYERS = 2; // instrument A / B

// Instrument index 849 = the device's "Off" value (no instrument assigned).
export const OFF_INSTRUMENT = 849;

// Pad "Layer" parameter (offset PadField.LAYER, +43): how instrument B is sounded.
// Values verified against the owner's manual.
export const LAYER_MODES = [
  "OFF", // only instrument A
  "MIX", // A and B always sound together
  "Layer", // B layered only above Fade Point
  "VELO MIX", // B mixed by strike force above Fade Point
  "VELO FADE", // cross-fade A->B at Fade Point
  "VELO SW", // switch A/B at Fade Point
] as const;

/** Fade Point (offset PadField.FADE_VALUE, +44) is active only for modes >= 2. */
export function fadePointActive(layerMode: number): boolean {
  return layerMode >= 2;
}

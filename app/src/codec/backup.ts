import SparkMD5 from "spark-md5";
import {
  KIT_OFFSET,
  KIT_SIZE,
  KITS_COUNT,
  PAD_OFFSET,
  PAD_SIZE,
  PADS_PER_KIT,
  MD5_SIZE,
} from "./layout";
import { KitAccessor } from "./kit";
import { PadAccessor } from "./pad";

function kitBase(index: number): number {
  return KIT_OFFSET + KIT_SIZE * index;
}
function padBase(kitIndex: number, padIndex: number): number {
  return PAD_OFFSET + PAD_SIZE * (kitIndex * PADS_PER_KIT + padIndex);
}

/** Compute the 16-byte MD5 of `body` and return it as bytes. */
function md5Bytes(body: Uint8Array): Uint8Array {
  const copy = new ArrayBuffer(body.byteLength);
  new Uint8Array(copy).set(body);
  const hex = SparkMD5.ArrayBuffer.hash(copy);
  const out = new Uint8Array(MD5_SIZE);
  for (let i = 0; i < MD5_SIZE; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

export interface ChecksumInfo {
  stored: string;
  computed: string;
  valid: boolean;
}

/**
 * In-memory model of a full HPD-20 backup. Wraps the raw file bytes and edits
 * them in-place; never re-slices overlapping blocks. `toBytes()` recomputes the
 * trailing MD5 so the device accepts the file.
 */
export class Backup {
  /** Full file bytes including the trailing 16-byte MD5. */
  readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  static parse(input: ArrayBuffer | Uint8Array): Backup {
    const src = input instanceof Uint8Array ? input : new Uint8Array(input);
    const bytes = new Uint8Array(src); // own copy
    if (bytes.length < KIT_OFFSET + KIT_SIZE * KITS_COUNT + MD5_SIZE) {
      throw new Error(
        `Datei zu klein (${bytes.length} Bytes) – ist das eine HPD-20 BKUP-XXX.HS0?`,
      );
    }
    return new Backup(bytes);
  }

  get body(): Uint8Array {
    return this.bytes.subarray(0, this.bytes.length - MD5_SIZE);
  }

  /** Verify the stored MD5 against a freshly computed one. */
  verifyChecksum(): ChecksumInfo {
    const stored = this.bytes.subarray(this.bytes.length - MD5_SIZE);
    const computed = md5Bytes(this.body);
    const hex = (b: Uint8Array) =>
      Array.from(b)
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
    const s = hex(stored);
    const c = hex(computed);
    return { stored: s, computed: c, valid: s === c };
  }

  kitCount(): number {
    return KITS_COUNT;
  }

  getKit(index: number): KitAccessor {
    return new KitAccessor(this.bytes, kitBase(index));
  }

  getPad(kitIndex: number, padIndex: number): PadAccessor {
    return new PadAccessor(this.bytes, padBase(kitIndex, padIndex));
  }

  // --- experimental kit-level operations (research branch only) ---
  //
  // Controlled MFX changes show that the MFX parameters for kit N reside in
  // bytes +99..+218 of the PRECEDING 224-byte record. The kit's own +0..+97
  // contains its kit settings, including effect types and ambience values.
  // +98 is padding (overlaps the first pad at the last kit), and\n  // +219..+223 is an invariant 5-byte delimiter; neither is copied.
  //
  // The 120-byte region for kit 1 is in the 224-byte prelude immediately
  // before KIT_OFFSET; its ownership still needs hardware confirmation.
  //
  // Format HK02: magic(4) + source backup length LE(4) + kit head(98)
  // + MFX parameter area(120) + 17 pads(1156). Never silently import the
  // old 1380-byte .kit files, which omit/shift the MFX parameter ownership.
  private static readonly KIT_HEAD_SIZE = 98;
  private static readonly MFX_PARAMS_SIZE = 120;
  private static readonly KIT_V2_HEADER_SIZE = 8;
  private static readonly KIT_V2_SIZE =
    Backup.KIT_V2_HEADER_SIZE + Backup.KIT_HEAD_SIZE +
    Backup.MFX_PARAMS_SIZE + PADS_PER_KIT * PAD_SIZE;

  private assertKitIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= KITS_COUNT) {
      throw new Error(`Invalid kit index: ${index}`);
    }
  }

  private mfxBase(index: number): number {
    // For index 0, this is the prelude just before the first kit record.
    return kitBase(index) - KIT_SIZE + 99;
  }

  /** Export the kit's settings, preceding-record MFX data and all pads. */
  exportKit(index: number): Uint8Array {
    this.assertKitIndex(index);
    const out = new Uint8Array(Backup.KIT_V2_SIZE);
    out.set([72, 75, 48, 50], 0); // "HK02"
    new DataView(out.buffer).setUint32(4, this.bytes.length, true);
    const headStart = Backup.KIT_V2_HEADER_SIZE;
    const mfxStart = headStart + Backup.KIT_HEAD_SIZE;
    const padsStart = mfxStart + Backup.MFX_PARAMS_SIZE;
    out.set(this.bytes.subarray(kitBase(index), kitBase(index) + Backup.KIT_HEAD_SIZE), headStart);
    out.set(this.bytes.subarray(this.mfxBase(index), this.mfxBase(index) + Backup.MFX_PARAMS_SIZE), mfxStart);
    for (let p = 0; p < PADS_PER_KIT; p++) {
      out.set(this.bytes.subarray(padBase(index, p), padBase(index, p) + PAD_SIZE), padsStart + p * PAD_SIZE);
    }
    return out;
  }

  /** Import an HK02 kit; refuse unknown formats and backup layout mismatch. */
  importKit(index: number, blob: Uint8Array): void {
    this.assertKitIndex(index);
    if (blob.length !== Backup.KIT_V2_SIZE ||
        blob[0] !== 72 || blob[1] !== 75 || blob[2] !== 48 || blob[3] !== 50) {
      throw new Error("Unsupported .kit file: this experimental build requires HK02 format.");
    }
    const sourceLength = new DataView(blob.buffer, blob.byteOffset, blob.byteLength).getUint32(4, true);
    if (sourceLength !== this.bytes.length) {
      throw new Error("Source and destination backups have different sizes/layouts; refusing unsafe kit import.");
    }
    const headStart = Backup.KIT_V2_HEADER_SIZE;
    const mfxStart = headStart + Backup.KIT_HEAD_SIZE;
    const padsStart = mfxStart + Backup.MFX_PARAMS_SIZE;
    this.bytes.set(blob.subarray(headStart, mfxStart), kitBase(index));
    this.bytes.set(blob.subarray(mfxStart, padsStart), this.mfxBase(index));
    for (let p = 0; p < PADS_PER_KIT; p++) {
      this.bytes.set(blob.subarray(padsStart + p * PAD_SIZE, padsStart + (p + 1) * PAD_SIZE), padBase(index, p));
    }
  }

  copyKit(from: number, to: number): void {
    if (from === to) return;
    this.importKit(to, this.exportKit(from));
  }

  swapKits(a: number, b: number): void {
    if (a === b) return;
    const tmp = this.exportKit(a);
    this.importKit(a, this.exportKit(b));
    this.importKit(b, tmp);
  }

  /** Reorder without touching adjacent kits' MFX parameters. */
  moveKit(from: number, to: number): void {
    this.assertKitIndex(from);
    this.assertKitIndex(to);
    if (from === to) return;
    const blobs = [];
    for (let i = 0; i < KITS_COUNT; i++) blobs.push(this.exportKit(i));
    const [moved] = blobs.splice(from, 1);
    blobs.splice(to, 0, moved);
    for (let i = 0; i < KITS_COUNT; i++) this.importKit(i, blobs[i]);
  }

  /** Serialize to a new byte array with a freshly computed trailing MD5. */
  toBytes(): Uint8Array {
    const out = new Uint8Array(this.bytes);
    const body = out.subarray(0, out.length - MD5_SIZE);
    out.set(md5Bytes(body), out.length - MD5_SIZE);
    return out;
  }
}

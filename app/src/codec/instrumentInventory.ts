import { Backup } from "./backup";
import { OFF_INSTRUMENT, PAD_NAMES, PADS_PER_KIT } from "./layout";

/** A source instrument reference. Do not assume its sample bytes or storage slot. */
export interface InstrumentUse {
  instrumentId: number;
  pads: { pad: string; layer: "A" | "B" }[];
  /** PATCH_INTERNAL values are retained for forensic comparison only. */
  internalIds: number[];
}

export interface KitInstrumentInventory {
  kitNumber: number;
  kitName: string;
  uniqueInstruments: InstrumentUse[];
  padAssignments: number;
  factoryInstrumentIds: number[];
  userInstrumentCandidateIds: number[];
  warnings: string[];
}

/**
 * Read-only inventory of a kit's instrument references.
 *
 * IMPORTANT: This does not identify which references are user WAV samples.
 * That requires an independently verified instrument table and sample index.
 * In particular, PATCH_INTERNAL is NOT assumed to be a WAV/sample identifier.
 */
export function inventoryKitInstruments(backup: Backup, kitIndex: number): KitInstrumentInventory {
  if (!Number.isInteger(kitIndex) || kitIndex < 0 || kitIndex >= backup.kitCount()) {
    throw new Error("Kit number is outside the backup's kit range");
  }
  const found = new Map<number, InstrumentUse>();
  let assignments = 0;
  for (let p = 0; p < PADS_PER_KIT; p++) {
    const pad = backup.getPad(kitIndex, p);
    for (let layer = 0; layer < 2; layer++) {
      const id = pad.getPatch(layer);
      if (id === OFF_INSTRUMENT) continue;
      let use = found.get(id);
      if (!use) {
        use = { instrumentId: id, pads: [], internalIds: [] };
        found.set(id, use);
      }
      use.pads.push({ pad: PAD_NAMES[p], layer: layer === 0 ? "A" : "B" });
      const internalId = pad.getInternalPatch(layer);
      if (!use.internalIds.includes(internalId)) use.internalIds.push(internalId);
      assignments++;
    }
  }
  return {
    kitNumber: kitIndex + 1,
    kitName: backup.getKit(kitIndex).getName(),
    uniqueInstruments: [...found.values()].sort((a, b) => a.instrumentId - b.instrumentId),
    padAssignments: assignments,
    factoryInstrumentIds: [...found.keys()].filter((id) => id >= 0 && id < OFF_INSTRUMENT).sort((a, b) => a - b),
    userInstrumentCandidateIds: [...found.keys()].filter((id) => id > OFF_INSTRUMENT).sort((a, b) => a - b),
    warnings: [
      "IDs below 849 match the published factory instrument range; IDs above 849 are user-instrument candidates, not verified sample dependencies.",
      "This inventory does not copy sample data or change instrument references.",
      "Inactive layer B references are included intentionally; they may become active later.",
    ],
  };
}

export function compareKitInstruments(
  source: Backup,
  sourceIndex: number,
  destination: Backup,
  destinationIndex: number,
) {
  const from = inventoryKitInstruments(source, sourceIndex);
  const to = inventoryKitInstruments(destination, destinationIndex);
  const destIds = new Set(to.uniqueInstruments.map((entry) => entry.instrumentId));
  return {
    source: from,
    destination: to,
    notUsedInDestinationKit: from.uniqueInstruments.filter((entry) => !destIds.has(entry.instrumentId)),
    /** Not a list of missing samples: only compares kit references. */
    safeToAutoRemap: false as const,
  };
}

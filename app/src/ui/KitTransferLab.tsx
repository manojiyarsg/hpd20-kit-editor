import { useState } from "react";
import { Backup } from "../codec/backup";
import { compareKitInstruments } from "../codec/instrumentInventory";
import { openBinaryFile, saveBinaryFile } from "../platform/files";

interface Props { destination: Backup; onClose: () => void; }

/**
 * Read-only first phase of cross-backup kit transfer. Never mutates either backup.
 * Sample relocation is intentionally unavailable until the user-sample format
 * and cross-kit reference table have been independently verified.
 */
export function KitTransferLab({ destination, onClose }: Props) {
  const [source, setSource] = useState<Backup | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [sourceIndex, setSourceIndex] = useState(11);
  const [destinationIndex, setDestinationIndex] = useState(149);
  const [error, setError] = useState("");

  const openSource = async () => {
    try {
      const file = await openBinaryFile(["HS0"], "Open source backup (Hindi)");
      if (!file) return;
      const candidate = Backup.parse(file.bytes);
      if (!candidate.verifyChecksum().valid) {
        throw new Error("Source backup checksum is invalid. Nothing was loaded.");
      }
      setSource(candidate);
      setSourceName(file.name);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const valid = source !== null;
  const comparison = valid
    ? compareKitInstruments(source, sourceIndex, destination, destinationIndex)
    : null;

  const saveReport = async () => {
    if (!comparison) return;
    const { source: src, destination: dst } = comparison;
    const lines = [
      "TriggerMap Cross-Backup Transfer — READ-ONLY PREFLIGHT",
      "No backup was modified; this report does NOT validate sample relocation.",
      `Source backup: ${sourceName}; Kit ${src.kitNumber}: ${src.kitName}`,
      `Source size: ${source?.bytes.length}; destination size: ${destination.bytes.length}`,
      `Source checksum valid: ${source?.verifyChecksum().valid}; destination checksum valid: ${destination.verifyChecksum().valid}`,
      `Destination kit: ${dst.kitNumber}: ${dst.kitName}`,
      `Source references: ${src.padAssignments}; distinct instrument IDs: ${src.uniqueInstruments.length}`,
      `Factory instrument IDs: ${src.factoryInstrumentIds.length}; user-instrument candidates: ${src.userInstrumentCandidateIds.length}`,
      "",
      ...src.uniqueInstruments.map((item) =>
        `Instrument ${item.instrumentId} | ${item.pads.map((p) => p.pad + "-" + p.layer).join(", ")} | internal references: ${item.internalIds.join(",")}`,
      ),
      "",
      "NOT VERIFIED: which IDs are user samples, audio/sample storage, free destination slots,",
      "sample dependencies shared by other kits, firmware compatibility, hardware playback.",
      "DO NOT assume matching numeric instrument IDs represent matching user samples.",
    ];
    await saveBinaryFile(
      new TextEncoder().encode(lines.join("\n")),
      "TriggerMap-Kit-Transfer-Preflight.txt",
      ["txt"],
      "Save read-only transfer preflight",
    );
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Cross-backup transfer preflight"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.85)", overflow: "auto", padding: 24 }}>
      <div style={{ maxWidth: 760, margin: "auto", background: "#20232b", color: "white", padding: 24, borderRadius: 12 }}>
        <h2>Complete Kit Import — Safety Preflight</h2>
        <p>This tool only inspects instruments. Sample copying and kit import are blocked until their storage formats are verified.</p>
        <button onClick={openSource}>Open source backup (Hindi)</button>
        <p>{sourceName || "No source selected"}</p>
        <label>Source kit (1–200):{" "}
          <input aria-label="Source kit number" type="number" min={1} max={200}
            value={sourceIndex + 1} onChange={(e) => setSourceIndex(Math.max(0, Math.min(199, (Number(e.target.value) || 1) - 1)))} />
        </label>
        <label style={{ marginLeft: 16 }}>Destination kit (1–200):{" "}
          <input aria-label="Destination kit number" type="number" min={1} max={200}
            value={destinationIndex + 1} onChange={(e) => setDestinationIndex(Math.max(0, Math.min(199, (Number(e.target.value) || 1) - 1)))} />
        </label>
        {source && source.bytes.length !== destination.bytes.length && (
          <p role="status">Backup sizes differ ({source.bytes.length.toLocaleString()} vs {destination.bytes.length.toLocaleString()} bytes). Read-only inspection is permitted; importing remains blocked until cross-layout and sample compatibility are verified.</p>
        )}
        {comparison && (
          <div>
            <h3>{comparison.source.kitName} → {comparison.destination.kitName}</h3>
            <p>{comparison.source.uniqueInstruments.length} distinct source instruments across {comparison.source.padAssignments} pad-layer assignments.</p>
            <p>{comparison.source.factoryInstrumentIds.length} factory IDs; {comparison.source.userInstrumentCandidateIds.length} user-instrument candidates requiring sample verification.</p>
            <p>{comparison.notUsedInDestinationKit.length} source instrument IDs are not referenced by this destination kit. This does NOT mean those samples are missing from the backup.</p>
            <details>
              <summary>Show source instrument references</summary>
              <ul>{comparison.source.uniqueInstruments.map((item) =>
                <li key={item.instrumentId}>#{item.instrumentId}: {item.pads.map((p) => p.pad + " " + p.layer).join(", ")}</li>
              )}</ul>
            </details>
            <button onClick={saveReport}>Save preflight report</button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <p><strong>Import disabled:</strong> no verified user-sample allocation or remapping implementation yet.</p>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/** Package information only. Runtime behavior is introduced by later plan units. */
export const enginePackage = Object.freeze({
  name: "@browser-vr-engine/core",
  version: "0.0.0",
  implementationStage: "workspace-foundation",
  coordinateConvention: Object.freeze({ units: "meters", handedness: "right", up: "Y" })
} as const);

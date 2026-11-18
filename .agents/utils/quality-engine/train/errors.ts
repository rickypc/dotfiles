/**
 * Typed error family for skill-manager LLM trigger training.
 *
 * One class per input boundary the training route guards: the frozen query set, the
 * router answers it measures, and the append-only ledger it records. The class name
 * names the boundary whose input was rejected, never a provider or transport.
 */

// biome-ignore lint/style/noExcessiveClassesPerFile: one typed-error family per training input boundary; splitting three empty marker classes into three files would hide the boundary contract.
export class TriggerQuerySetError extends Error {}

export class MeasurementError extends Error {}

export class LedgerError extends Error {}

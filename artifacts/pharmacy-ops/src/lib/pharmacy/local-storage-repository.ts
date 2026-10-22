import { STATE_VERSION, type CompleteSaleInput, type Role, type State, type Supplier } from "./types";
import type { PharmacyRepository } from "./repository";
import { buildSeed } from "./seed";
import * as domain from "./services";

export const STORAGE_KEY = "pharmacy-ops-demo-v4";
const PREVIOUS_KEYS = ["pharmacy-ops-demo-v3", "pharmacy-ops-demo-v2", "pharmacy-ops-demo-v1"];

function isStateShape(value: unknown): value is State {
  if (!value || typeof value !== "object") return false;
  const candidate = value as State;
  return (
    Array.isArray(candidate.medicines) &&
    Array.isArray(candidate.sales) &&
    Array.isArray(candidate.batches) &&
    Array.isArray(candidate.employees) &&
    Array.isArray(candidate.audit)
  );
}

function migrate(parsed: State): State {
  return {
    ...parsed,
    version: STATE_VERSION,
    purchases: parsed.purchases || [],
    stocktakes: parsed.stocktakes || [],
    movements: parsed.movements || [],
    alertsAcknowledged: parsed.alertsAcknowledged || [],
  };
}

export function createLocalStorageRepository(
  storage: Pick<Storage, "getItem" | "setItem"> = globalThis.localStorage,
): PharmacyRepository {
  const listeners = new Set<() => void>();
  let storageError: string | null = null;
  let saleLock = false;
  let sequence = 0;
  const ctx = {
    now: () => new Date(),
    id: (prefix: string) => `${prefix}-${Date.now()}-${++sequence}`,
  };

  function notify() {
    listeners.forEach((listener) => listener());
  }

  function persist(next: State) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
      storageError = null;
    } catch (error) {
      storageError = `Demo data could not be saved to this browser. Changes were not applied. Check localStorage availability and free space, then retry. ${error instanceof Error ? error.message : ""}`;
      notify();
      throw new Error(storageError);
    }
  }

  function load(): State {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as State;
        if (isStateShape(parsed) && parsed.version === STATE_VERSION) return parsed;
        if (isStateShape(parsed) && [1, 2, 3].includes(parsed.version)) {
          const migrated = migrate(parsed);
          persist(migrated);
          return migrated;
        }
      }
    } catch (error) {
      storageError = `Local demo storage could not be read. A temporary seed is shown, but changes cannot persist until storage is available. ${error instanceof Error ? error.message : ""}`;
    }
    try {
      for (const key of PREVIOUS_KEYS) {
        const raw = storage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as State;
        if (!isStateShape(parsed)) continue;
        const migrated = migrate(parsed);
        persist(migrated);
        return migrated;
      }
    } catch (error) {
      storageError = `Older demo storage could not be migrated. ${error instanceof Error ? error.message : ""}`;
    }
    const seeded = buildSeed();
    try {
      persist(seeded);
    } catch (error) {
      storageError = `Demo storage is unavailable. The starter data is temporary and edits will not persist. ${error instanceof Error ? error.message : ""}`;
    }
    return seeded;
  }

  let state = load();

  function commit(next: State) {
    persist(next);
    state = next;
    notify();
  }

  function apply(mutator: (current: State) => State) {
    const next = mutator(state);
    commit(next);
    return next;
  }

  return {
    getState: () => state,
    getStorageError: () => storageError,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    login(employeeId) {
      apply((current) => domain.login(current, employeeId, ctx));
      return true;
    },
    logout() {
      apply((current) => domain.logout(current, ctx));
    },
    addMedicine(input) {
      apply((current) => domain.addMedicine(current, input, ctx));
    },
    updateMedicine(id, changes) {
      apply((current) => domain.updateMedicine(current, id, changes, ctx));
    },
    archiveMedicine(id) {
      apply((current) => domain.archiveMedicine(current, id, ctx));
    },
    completeSale(input: CompleteSaleInput) {
      if (saleLock) throw new Error("A sale is already being submitted.");
      saleLock = true;
      try {
        let sale = state.sales[0];
        apply((current) => {
          const result = domain.completeSale(current, input, ctx);
          sale = result.sale;
          return result.state;
        });
        return sale;
      } finally {
        saleLock = false;
      }
    },
    createPurchase(input) {
      apply((current) => domain.createPurchase(current, input, ctx));
    },
    cancelPurchase(id) {
      apply((current) => domain.cancelPurchase(current, id, ctx));
    },
    receivePurchase(id) {
      apply((current) => domain.receivePurchase(current, id, ctx));
    },
    createSupplier(input: Omit<Supplier, "id">) {
      apply((current) => domain.createSupplier(current, input, ctx));
    },
    updateSupplier(id, changes) {
      apply((current) => domain.updateSupplier(current, id, changes, ctx));
    },
    adjustBatch(batchId, newQuantity, reason) {
      apply((current) => domain.adjustBatch(current, batchId, newQuantity, reason, ctx));
    },
    startStocktake() {
      const next = apply((current) => domain.startStocktake(current, ctx));
      return next.stocktakes[0];
    },
    updateStocktakeCount(takeId, batchId, counted) {
      apply((current) => domain.updateStocktakeCount(current, takeId, batchId, counted, ctx));
    },
    approveStocktake(takeId) {
      const next = apply((current) => domain.approveStocktake(current, takeId, ctx));
      const approved = next.stocktakes.find((item) => item.id === takeId);
      if (!approved) throw new Error("Stocktake not found.");
      return approved;
    },
    updateEmployeeRole(employeeId, role: Role) {
      apply((current) => domain.updateEmployeeRole(current, employeeId, role, ctx));
    },
    setEmployeeActive(employeeId, active) {
      apply((current) => domain.setEmployeeActive(current, employeeId, active, ctx));
    },
    updateSettings(settings) {
      apply((current) => domain.updateSettings(current, settings, ctx));
    },
    acknowledgeAlert(alertId) {
      apply((current) => domain.acknowledgeAlert(current, alertId, ctx));
    },
    audit(action, module, entityType, entityId, description, before, after) {
      apply((current) =>
        domain.recordAudit(current, { action, module, entityType, entityId, description, before, after }, ctx),
      );
    },
    reset() {
      commit(buildSeed());
    },
    export() {
      return JSON.stringify(state, null, 2);
    },
    import(json: string) {
      const parsed = JSON.parse(json) as State;
      if (!isStateShape(parsed) || parsed.version !== STATE_VERSION) {
        throw new Error("This file is not a valid Pharmacy Operations v4 backup.");
      }
      commit(parsed);
    },
  };
}

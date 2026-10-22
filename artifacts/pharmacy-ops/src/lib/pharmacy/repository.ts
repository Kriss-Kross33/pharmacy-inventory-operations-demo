import type {
  CompleteSaleInput,
  Medicine,
  Person,
  Purchase,
  Role,
  Sale,
  State,
  Stocktake,
  Supplier,
} from "./types";

export interface PharmacyRepository {
  getState(): State;
  getStorageError(): string | null;
  subscribe(listener: () => void): () => void;
  login(employeeId: string): boolean;
  logout(): void;
  addMedicine(input: Partial<Medicine>): void;
  updateMedicine(id: string, changes: Partial<Medicine>): void;
  archiveMedicine(id: string): void;
  completeSale(input: CompleteSaleInput): Sale;
  createPurchase(input: Omit<Purchase, "id" | "reference" | "status" | "paymentStatus"> & {
    reference?: string;
    paymentStatus?: Purchase["paymentStatus"];
  }): void;
  cancelPurchase(id: string): void;
  receivePurchase(id: string): void;
  createSupplier(input: Omit<Supplier, "id">): void;
  updateSupplier(id: string, changes: Partial<Supplier>): void;
  adjustBatch(batchId: string, newQuantity: number, reason: string): void;
  startStocktake(): Stocktake;
  updateStocktakeCount(takeId: string, batchId: string, counted: number): void;
  approveStocktake(takeId: string): Stocktake;
  updateEmployeeRole(employeeId: string, role: Role): void;
  setEmployeeActive(employeeId: string, active: boolean): void;
  updateSettings(settings: State["settings"]): void;
  acknowledgeAlert(alertId: string): void;
  audit(
    action: string,
    module: string,
    entityType: string,
    entityId: string,
    description: string,
    before?: unknown,
    after?: unknown,
  ): void;
  reset(): void;
  export(): string;
  import(json: string): void;
}

export type { CompleteSaleInput, Medicine, Person, Purchase, Role, Sale, State, Stocktake, Supplier };

export type Role = "Administrator" | "Inventory Viewer" | "Sales Operator";

export type Person = {
  id: string;
  name: string;
  role: Role;
  active: boolean;
};

export type SellingUnit = {
  name: string;
  conversion: number;
};

export type Medicine = {
  id: string;
  name: string;
  genericName: string;
  brandName: string;
  strength: string;
  dosageForm: string;
  category: string;
  manufacturer: string;
  barcode: string;
  description: string;
  baseUnit: string;
  sellingUnits: SellingUnit[];
  sellingPrice: number;
  reorderThreshold: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Batch = {
  id: string;
  medicineId: string;
  batchNumber: string;
  supplierId: string;
  purchaseDate: string;
  expiryDate: string;
  quantityReceived: number;
  quantityRemaining: number;
  purchaseCost: number;
  status: "active" | "expired";
};

export type Supplier = {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
};

export type SaleAllocation = {
  batchId: string;
  quantity: number;
};

export type SaleItem = {
  medicineId: string;
  name: string;
  quantity: number;
  unit: string;
  conversion: number;
  baseQuantity: number;
  unitPrice: number;
  allocations: SaleAllocation[];
};

export type Sale = {
  id: string;
  receiptNumber: string;
  attendantId: string;
  items: SaleItem[];
  discount: number;
  total: number;
  paymentMethod: string;
  createdAt: string;
  requestId?: string;
};

export type Movement = {
  id: string;
  medicineId: string;
  batchId: string;
  type: string;
  quantityChange: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  performedBy: string;
  timestamp: string;
  reference: string;
};

export type AuditEvent = {
  id: string;
  timestamp: string;
  userId: string;
  role: Role;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  description: string;
  before?: unknown;
  after?: unknown;
  outcome: "Completed" | "Rejected";
};

export type PurchaseItem = {
  medicineId: string;
  batchNumber: string;
  quantity: number;
  unitCost: number;
  expiryDate: string;
};

export type Purchase = {
  id: string;
  reference: string;
  supplierId: string;
  invoiceNumber: string;
  purchaseDate: string;
  items: PurchaseItem[];
  total: number;
  paymentStatus: "Unpaid" | "Paid";
  status: "Draft" | "Received" | "Cancelled";
  notes: string;
};

export type StocktakeLine = {
  medicineId: string;
  batchId: string;
  batchNumber: string;
  expected: number;
  counted: number;
  variance: number;
  valueDifference: number;
};

export type Stocktake = {
  id: string;
  startedAt: string;
  approvedAt: string | null;
  status: "Counting" | "Approved";
  lines: StocktakeLine[];
};

export type PharmacySettings = {
  pharmacyName: string;
  address: string;
  phone: string;
  lowStockThreshold: number;
  expiryWarningDays: number;
  currency: string;
  dateFormat: string;
  density: string;
};

export type State = {
  version: number;
  sessionId: string | null;
  employees: Person[];
  medicines: Medicine[];
  batches: Batch[];
  suppliers: Supplier[];
  sales: Sale[];
  movements: Movement[];
  purchases: Purchase[];
  stocktakes: Stocktake[];
  audit: AuditEvent[];
  settings: PharmacySettings;
  alertsAcknowledged: string[];
};

export const STATE_VERSION = 4;

export type DomainContext = {
  now: () => Date;
  id: (prefix: string) => string;
};

export type CompleteSaleInput = {
  items: Array<{
    medicineId: string;
    quantity: number;
    unit?: string;
    conversion?: number;
  }>;
  paymentMethod: string;
  discount?: number;
  requestId?: string;
};

export type DerivedAlert = {
  id: string;
  severity: "high" | "medium" | "info";
  title: string;
  description: string;
  link: string;
  informational?: boolean;
};

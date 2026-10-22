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

export const ITEM_TYPES = [
  "medicine",
  "medical_supply",
  "supplement",
  "personal_care",
  "baby_care",
  "general_retail",
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  medicine: "Medicine",
  medical_supply: "Medical supply",
  supplement: "Supplement",
  personal_care: "Personal care",
  baby_care: "Baby care",
  general_retail: "General retail",
};

export const REGULATORY_CLASSES = ["OTC", "POM", "Controlled", "Not applicable"] as const;

export type RegulatoryClass = (typeof REGULATORY_CLASSES)[number];

export type Item = {
  id: string;
  name: string;
  itemType: ItemType;
  category: string;
  brandName: string;
  manufacturer: string;
  barcode: string;
  description: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  prescriptionRequired: boolean;
  regulatoryClassification: RegulatoryClass | string;
  baseUnit: string;
  sellingUnits: SellingUnit[];
  sellingPrice: number;
  reorderThreshold: number;
  trackBatches: boolean;
  trackExpiry: boolean;
  imageDataUrl: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/** @deprecated Use Item. Kept so existing screens and tests keep compiling. */
export type Medicine = Item;

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
  requestId?: string;
};

export type StocktakeLine = {
  medicineId: string;
  batchId: string;
  batchNumber: string;
  expected: number;
  counted: number;
  variance: number;
  valueDifference: number;
  reason: string;
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
  medicines: Item[];
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

export const STATE_VERSION = 5;

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

export type StockInLineInput = {
  medicineId: string;
  quantity: number;
  unit?: string;
  conversion?: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: string;
};

export type StockInInput = {
  supplierId: string;
  invoiceNumber: string;
  purchaseDate: string;
  notes?: string;
  requestId?: string;
  reference?: string;
  items: StockInLineInput[];
};

export type DerivedAlert = {
  id: string;
  severity: "high" | "medium" | "info";
  title: string;
  description: string;
  link: string;
  informational?: boolean;
};

import { normalizeItem } from "./item-catalog";
import { assertCan, requireActor } from "./permissions";
import { availableStock, isSellable } from "./queries";
import type {
  AuditEvent,
  Batch,
  CompleteSaleInput,
  DomainContext,
  Item,
  Movement,
  Person,
  Purchase,
  PurchaseItem,
  Role,
  Sale,
  SaleItem,
  State,
  StockInInput,
  Stocktake,
  Supplier,
} from "./types";

function appendAudit(
  state: State,
  ctx: DomainContext,
  fields: Omit<AuditEvent, "id" | "timestamp" | "userId" | "role" | "outcome"> & {
    outcome?: AuditEvent["outcome"];
  },
): State {
  const person = requireActor(state);
  const event: AuditEvent = {
    id: ctx.id("aud"),
    timestamp: ctx.now().toISOString(),
    userId: person.id,
    role: person.role,
    action: fields.action,
    module: fields.module,
    entityType: fields.entityType,
    entityId: fields.entityId,
    description: fields.description,
    before: fields.before,
    after: fields.after,
    outcome: fields.outcome ?? "Completed",
  };
  return { ...state, audit: [event, ...state.audit] };
}

function cloneBatches(batches: Batch[]): Batch[] {
  return batches.map((batch) => ({ ...batch }));
}

export function login(state: State, employeeId: string, ctx: DomainContext): State {
  const employee = state.employees.find((person) => person.id === employeeId && person.active);
  if (!employee) throw new Error("That demo account is not available.");
  const previous = state.sessionId;
  const signedIn: State = { ...state, sessionId: employee.id };
  return appendAudit(signedIn, ctx, {
    action: "Sign in",
    module: "Session",
    entityType: "Employee",
    entityId: employee.id,
    description: `${employee.name} signed in${previous ? ` after switching from ${previous}` : ""}.`,
  });
}

export function logout(state: State, ctx: DomainContext): State {
  const person = state.employees.find((employee) => employee.id === state.sessionId);
  const audited = person
    ? appendAudit(state, ctx, {
        action: "Sign out",
        module: "Session",
        entityType: "Employee",
        entityId: person.id,
        description: `${person.name} signed out.`,
      })
    : state;
  return { ...audited, sessionId: null };
}

export function addMedicine(state: State, input: Partial<Item>, ctx: DomainContext): State {
  assertCan(state, "admin");
  const item = normalizeItem(input, undefined, ctx.now().toISOString(), ctx.id("itm"));
  return appendAudit(
    { ...state, medicines: [item, ...state.medicines] },
    ctx,
    {
      action: "Create",
      module: "Inventory",
      entityType: "Item",
      entityId: item.id,
      description: `Created ${item.name}`,
      after: item,
    },
  );
}

export const addItem = addMedicine;

export function updateMedicine(state: State, id: string, changes: Partial<Item>, ctx: DomainContext): State {
  assertCan(state, "admin");
  const previous = state.medicines.find((item) => item.id === id);
  if (!previous) throw new Error("Item not found.");
  const next = normalizeItem({ ...previous, ...changes }, previous, ctx.now().toISOString(), previous.id);
  const priceChanged =
    changes.sellingPrice !== undefined && Number(changes.sellingPrice) !== previous.sellingPrice;
  const archived = previous.active && changes.active === false;
  return appendAudit(
    { ...state, medicines: state.medicines.map((item) => (item.id === id ? next : item)) },
    ctx,
    {
      action: archived ? "Archive" : priceChanged ? "Price change" : "Update",
      module: "Inventory",
      entityType: "Item",
      entityId: id,
      description: archived
        ? `Archived ${next.name}`
        : priceChanged
          ? `Changed selling price for ${next.name} from ${previous.sellingPrice} to ${next.sellingPrice}.`
          : `Updated ${next.name}`,
      before: previous,
      after: next,
    },
  );
}

export const updateItem = updateMedicine;

export function archiveMedicine(state: State, id: string, ctx: DomainContext): State {
  return updateMedicine(state, id, { active: false }, ctx);
}

export function completeSale(
  state: State,
  input: CompleteSaleInput,
  ctx: DomainContext,
): { state: State; sale: Sale } {
  const person = assertCan(state, "pos");
  if (input.requestId) {
    const existing = state.sales.find((sale) => sale.requestId === input.requestId);
    if (existing) return { state, sale: existing };
  }
  if (!input.items.length) throw new Error("Add at least one item to the sale.");
  const discount = Number(input.discount) || 0;
  if (!Number.isFinite(discount) || discount < 0) throw new Error("Discount must be a non-negative amount.");

  const remaining = cloneBatches(state.batches);
  const timestamp = ctx.now();
  const saleItems: SaleItem[] = [];
  const movements: Movement[] = [];

  for (const item of input.items) {
    const medicine = state.medicines.find((candidate) => candidate.id === item.medicineId);
    if (!medicine || !medicine.active || !Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error("One or more cart items are invalid or unavailable.");
    }
    const chosen = medicine.sellingUnits.find((unit) => unit.name === (item.unit || medicine.baseUnit));
    const conversion = item.conversion ?? chosen?.conversion;
    if (!chosen || !Number.isInteger(conversion) || conversion !== chosen.conversion || conversion < 1) {
      throw new Error(`Invalid selling unit for ${medicine.name}.`);
    }
    let needed = item.quantity * conversion;
    const baseQuantity = needed;
    const allocations: SaleItem["allocations"] = [];
    const usable = remaining
      .filter((batch) => batch.medicineId === medicine.id && isSellable(batch, timestamp))
      .sort((left, right) => left.expiryDate.localeCompare(right.expiryDate));
    for (const batch of usable) {
      const take = Math.min(needed, batch.quantityRemaining);
      if (!take) continue;
      const previousQuantity = batch.quantityRemaining;
      batch.quantityRemaining -= take;
      needed -= take;
      allocations.push({ batchId: batch.id, quantity: take });
      movements.push({
        id: ctx.id("mov"),
        medicineId: medicine.id,
        batchId: batch.id,
        type: "Sale",
        quantityChange: -take,
        previousQuantity,
        newQuantity: batch.quantityRemaining,
        reason: "Point of sale",
        performedBy: person.id,
        timestamp: timestamp.toISOString(),
        reference: "",
      });
      if (!needed) break;
    }
    if (needed) throw new Error(`Insufficient unexpired stock for ${medicine.name} in ${chosen.name} units.`);
    saleItems.push({
      medicineId: medicine.id,
      name: medicine.name,
      quantity: item.quantity,
      unit: chosen.name,
      conversion,
      baseQuantity,
      unitPrice: medicine.sellingPrice * conversion,
      allocations,
    });
  }

  const total = saleItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) - discount;
  if (total < 0) throw new Error("Discount exceeds the sale value.");

  const sale: Sale = {
    id: ctx.id("sale"),
    receiptNumber: `RCP-${String(state.sales.length + 1).padStart(6, "0")}`,
    attendantId: person.id,
    items: saleItems,
    discount,
    total,
    paymentMethod: input.paymentMethod,
    createdAt: timestamp.toISOString(),
    requestId: input.requestId,
  };
  movements.forEach((movement) => {
    movement.reference = sale.receiptNumber;
  });

  const next = appendAudit(
    {
      ...state,
      batches: remaining,
      sales: [sale, ...state.sales],
      movements: [...movements, ...state.movements],
    },
    ctx,
    {
      action: "Sale",
      module: "POS",
      entityType: "Sale",
      entityId: sale.id,
      description: `Receipt ${sale.receiptNumber} completed for GH₵ ${(total / 100).toFixed(2)}.`,
      after: sale,
    },
  );
  return { state: next, sale };
}

export function createPurchase(
  state: State,
  input: Omit<Purchase, "id" | "reference" | "status" | "paymentStatus"> & {
    reference?: string;
    paymentStatus?: Purchase["paymentStatus"];
  },
  ctx: DomainContext,
): State {
  assertCan(state, "admin");
  if (!input.supplierId) throw new Error("A supplier is required.");
  if (!input.items.length) throw new Error("Add at least one purchase line.");
  for (const line of input.items) {
    if (!line.medicineId || !line.batchNumber.trim() || !Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new Error("Each purchase line needs an item, batch number and whole quantity.");
    }
  }
  const purchase: Purchase = {
    id: ctx.id("pur"),
    reference: input.reference || `PO-${ctx.now().getFullYear()}-${String(state.purchases.length + 1).padStart(3, "0")}`,
    supplierId: input.supplierId,
    invoiceNumber: input.invoiceNumber || "",
    purchaseDate: input.purchaseDate,
    items: input.items,
    total: input.total,
    paymentStatus: input.paymentStatus || "Unpaid",
    status: "Draft",
    notes: input.notes || "",
  };
  return appendAudit(
    { ...state, purchases: [purchase, ...state.purchases] },
    ctx,
    {
      action: "Create",
      module: "Purchases",
      entityType: "Purchase",
      entityId: purchase.id,
      description: `Created ${purchase.reference}`,
      after: purchase,
    },
  );
}

export function cancelPurchase(state: State, purchaseId: string, ctx: DomainContext): State {
  assertCan(state, "admin");
  const purchase = state.purchases.find((item) => item.id === purchaseId);
  if (!purchase) throw new Error("Purchase not found.");
  if (purchase.status !== "Draft") throw new Error("Only draft purchases can be cancelled.");
  const cancelled: Purchase = { ...purchase, status: "Cancelled" };
  return appendAudit(
    { ...state, purchases: state.purchases.map((item) => (item.id === purchaseId ? cancelled : item)) },
    ctx,
    {
      action: "Cancel",
      module: "Purchases",
      entityType: "Purchase",
      entityId: purchase.id,
      description: `Cancelled ${purchase.reference}`,
      before: purchase,
      after: cancelled,
    },
  );
}

export function receivePurchase(state: State, purchaseId: string, ctx: DomainContext): State {
  const person = assertCan(state, "admin");
  const purchase = state.purchases.find((item) => item.id === purchaseId);
  if (!purchase) throw new Error("Purchase not found.");
  if (purchase.status !== "Draft") throw new Error("Only draft purchases can be received.");

  const batches = cloneBatches(state.batches);
  const movements: Movement[] = [];
  const timestamp = ctx.now().toISOString();

  for (const line of purchase.items) {
    if (!line.medicineId || !Number.isInteger(line.quantity) || line.quantity < 1 || !line.batchNumber.trim()) {
      throw new Error("Each purchase line needs an item, batch and quantity.");
    }
    const catalogItem = state.medicines.find((item) => item.id === line.medicineId);
    if (catalogItem?.trackExpiry !== false) {
      const expiry = new Date(`${line.expiryDate}T00:00:00`);
      if (Number.isNaN(expiry.getTime())) throw new Error("Each purchase line needs a valid expiry date.");
    }
    const batch: Batch = {
      id: ctx.id("bat"),
      medicineId: line.medicineId,
      batchNumber: line.batchNumber,
      supplierId: purchase.supplierId,
      purchaseDate: purchase.purchaseDate || timestamp.slice(0, 10),
      expiryDate: line.expiryDate,
      purchaseCost: Number(line.unitCost) || 0,
      quantityReceived: line.quantity,
      quantityRemaining: line.quantity,
      status: "active",
    };
    batches.push(batch);
    movements.push({
      id: ctx.id("mov"),
      medicineId: batch.medicineId,
      batchId: batch.id,
      type: "Purchase receipt",
      quantityChange: batch.quantityRemaining,
      previousQuantity: 0,
      newQuantity: batch.quantityRemaining,
      reason: "Purchase received",
      performedBy: person.id,
      timestamp,
      reference: purchase.reference,
    });
  }

  const received: Purchase = { ...purchase, status: "Received" };
  return appendAudit(
    {
      ...state,
      batches,
      movements: [...movements, ...state.movements],
      purchases: state.purchases.map((item) => (item.id === purchaseId ? received : item)),
    },
    ctx,
    {
      action: "Receive",
      module: "Purchases",
      entityType: "Purchase",
      entityId: purchase.id,
      description: `Received ${purchase.reference}`,
      before: purchase,
      after: received,
    },
  );
}

export function receiveStockIn(
  state: State,
  input: StockInInput,
  ctx: DomainContext,
): { state: State; purchase: Purchase } {
  const person = assertCan(state, "admin");
  if (input.requestId) {
    const existing = state.purchases.find((purchase) => purchase.requestId === input.requestId);
    if (existing) return { state, purchase: existing };
  }
  if (!input.supplierId) throw new Error("A supplier is required.");
  if (!state.suppliers.some((supplier) => supplier.id === input.supplierId && supplier.active)) {
    throw new Error("Choose an active supplier.");
  }
  if (!input.items.length) throw new Error("Add at least one item to this delivery.");

  const invoice = (input.invoiceNumber || "").trim();
  if (invoice) {
    const duplicate = state.purchases.find(
      (purchase) =>
        purchase.status === "Received" &&
        purchase.supplierId === input.supplierId &&
        (purchase.invoiceNumber || "").trim().toLowerCase() === invoice.toLowerCase(),
    );
    if (duplicate) throw new Error("This supplier invoice has already been posted.");
  }

  const timestamp = ctx.now();
  const purchaseDate = input.purchaseDate || timestamp.toISOString().slice(0, 10);
  const batches = cloneBatches(state.batches);
  const movements: Movement[] = [];
  const purchaseItems: PurchaseItem[] = [];

  for (const line of input.items) {
    const item = state.medicines.find((candidate) => candidate.id === line.medicineId && candidate.active);
    if (!item) throw new Error("One or more delivery lines reference an unknown or archived item.");
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new Error(`Quantity for ${item.name} must be a whole number of 1 or more.`);
    }
    const chosen = item.sellingUnits.find((unit) => unit.name === (line.unit || item.baseUnit));
    const conversion = line.conversion ?? chosen?.conversion ?? 1;
    if (!chosen || !Number.isInteger(conversion) || conversion !== chosen.conversion || conversion < 1) {
      throw new Error(`Invalid unit for ${item.name}.`);
    }
    const baseQuantity = line.quantity * conversion;
    let batchNumber = (line.batchNumber || "").trim();
    if (item.trackBatches && !batchNumber) {
      throw new Error(`Batch number is required for ${item.name}.`);
    }
    if (!batchNumber) {
      batchNumber = `LOT-${item.id.slice(-6)}-${purchaseDate.replaceAll("-", "")}`;
    }
    let expiryDate = (line.expiryDate || "").trim();
    if (item.trackExpiry) {
      const expiry = new Date(`${expiryDate}T00:00:00`);
      if (!expiryDate || Number.isNaN(expiry.getTime())) {
        throw new Error(`Expiry date is required for ${item.name}.`);
      }
    }

    const unitCost = Number(line.unitCost);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new Error(`Purchase cost for ${item.name} must be zero or more.`);
    }
    const purchaseCost = Math.round(unitCost / conversion);
    const batch: Batch = {
      id: ctx.id("bat"),
      medicineId: item.id,
      batchNumber,
      supplierId: input.supplierId,
      purchaseDate,
      expiryDate,
      quantityReceived: baseQuantity,
      quantityRemaining: baseQuantity,
      purchaseCost,
      status: "active",
    };
    batches.push(batch);
    movements.push({
      id: ctx.id("mov"),
      medicineId: item.id,
      batchId: batch.id,
      type: "Purchase receipt",
      quantityChange: baseQuantity,
      previousQuantity: 0,
      newQuantity: baseQuantity,
      reason: "Stock in",
      performedBy: person.id,
      timestamp: timestamp.toISOString(),
      reference: "",
    });
    purchaseItems.push({
      medicineId: item.id,
      batchNumber,
      quantity: baseQuantity,
      unitCost: purchaseCost,
      expiryDate,
    });
  }

  const purchase: Purchase = {
    id: ctx.id("pur"),
    reference:
      input.reference || `IN-${timestamp.getFullYear()}-${String(state.purchases.length + 1).padStart(3, "0")}`,
    supplierId: input.supplierId,
    invoiceNumber: invoice,
    purchaseDate,
    items: purchaseItems,
    total: purchaseItems.reduce((sum, line) => sum + line.quantity * line.unitCost, 0),
    paymentStatus: "Paid",
    status: "Received",
    notes: input.notes || "",
    requestId: input.requestId,
  };
  movements.forEach((movement) => {
    movement.reference = purchase.reference;
  });

  const next = appendAudit(
    {
      ...state,
      batches,
      movements: [...movements, ...state.movements],
      purchases: [purchase, ...state.purchases],
    },
    ctx,
    {
      action: "Stock in",
      module: "Inventory",
      entityType: "Purchase",
      entityId: purchase.id,
      description: `Posted stock in ${purchase.reference}${invoice ? ` · invoice ${invoice}` : ""}.`,
      after: purchase,
    },
  );
  return { state: next, purchase };
}

export function createSupplier(state: State, input: Omit<Supplier, "id">, ctx: DomainContext): State {
  assertCan(state, "admin");
  if (!input.name.trim()) throw new Error("Supplier name is required.");
  const supplier: Supplier = { ...input, id: ctx.id("sup"), name: input.name.trim() };
  return appendAudit(
    { ...state, suppliers: [supplier, ...state.suppliers] },
    ctx,
    {
      action: "Create",
      module: "Suppliers",
      entityType: "Supplier",
      entityId: supplier.id,
      description: `Created ${supplier.name}`,
      after: supplier,
    },
  );
}

export function updateSupplier(state: State, id: string, changes: Partial<Supplier>, ctx: DomainContext): State {
  assertCan(state, "admin");
  const previous = state.suppliers.find((supplier) => supplier.id === id);
  if (!previous) throw new Error("Supplier not found.");
  const next: Supplier = { ...previous, ...changes, id: previous.id };
  return appendAudit(
    { ...state, suppliers: state.suppliers.map((supplier) => (supplier.id === id ? next : supplier)) },
    ctx,
    {
      action: "Update",
      module: "Suppliers",
      entityType: "Supplier",
      entityId: id,
      description: `Updated ${next.name}`,
      before: previous,
      after: next,
    },
  );
}

export function adjustBatch(state: State, batchId: string, newQuantity: number, reason: string, ctx: DomainContext): State {
  const person = assertCan(state, "admin");
  if (!Number.isInteger(newQuantity) || newQuantity < 0) {
    throw new Error("Count must be a whole number of zero or more.");
  }
  if (!reason.trim()) throw new Error("Provide a reason for the stock adjustment.");
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch) throw new Error("Batch not found.");
  const difference = newQuantity - batch.quantityRemaining;
  if (!difference) throw new Error("The counted quantity matches current stock.");
  const nextBatch: Batch = { ...batch, quantityRemaining: newQuantity };
  const movement: Movement = {
    id: ctx.id("mov"),
    medicineId: batch.medicineId,
    batchId: batch.id,
    type: "Adjustment",
    quantityChange: difference,
    previousQuantity: batch.quantityRemaining,
    newQuantity,
    reason: reason.trim(),
    performedBy: person.id,
    timestamp: ctx.now().toISOString(),
    reference: `ADJ-${ctx.id("adj").slice(-6)}`,
  };
  return appendAudit(
    {
      ...state,
      batches: state.batches.map((item) => (item.id === batch.id ? nextBatch : item)),
      movements: [movement, ...state.movements],
    },
    ctx,
    {
      action: "Stock adjustment",
      module: "Inventory",
      entityType: "Batch",
      entityId: batch.id,
      description: `Adjusted ${batch.batchNumber} by ${difference > 0 ? "+" : ""}${difference} units: ${reason.trim()}.`,
      before: batch,
      after: nextBatch,
    },
  );
}

export function startStocktake(state: State, ctx: DomainContext): State {
  assertCan(state, "admin");
  const take: Stocktake = {
    id: ctx.id("take"),
    startedAt: ctx.now().toISOString(),
    approvedAt: null,
    status: "Counting",
    lines: state.batches.map((batch) => ({
      medicineId: batch.medicineId,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      expected: batch.quantityRemaining,
      counted: batch.quantityRemaining,
      variance: 0,
      valueDifference: 0,
      reason: "",
    })),
  };
  return appendAudit(
    { ...state, stocktakes: [take, ...state.stocktakes] },
    ctx,
    {
      action: "Start",
      module: "Stocktaking",
      entityType: "Stocktake",
      entityId: take.id,
      description: "Started a per-batch stocktake.",
      after: take,
    },
  );
}

export function updateStocktakeCount(
  state: State,
  takeId: string,
  batchId: string,
  counted: number,
  ctx: DomainContext,
  reason?: string,
): State {
  assertCan(state, "admin");
  if (!Number.isInteger(counted) || counted < 0) throw new Error("Count must be a whole number of zero or more.");
  const take = state.stocktakes.find((item) => item.id === takeId);
  if (!take || take.status !== "Counting") throw new Error("Only a counting stocktake can be updated.");
  const batch = state.batches.find((item) => item.id === batchId);
  const lines = take.lines.map((line) => {
    if (line.batchId !== batchId) return line;
    const variance = counted - line.expected;
    return {
      ...line,
      counted,
      variance,
      valueDifference: variance * (batch?.purchaseCost || 0),
      reason: reason !== undefined ? reason : line.reason,
    };
  });
  const next: Stocktake = { ...take, lines };
  return {
    ...state,
    stocktakes: state.stocktakes.map((item) => (item.id === takeId ? next : item)),
  };
}

export function approveStocktake(state: State, takeId: string, ctx: DomainContext): State {
  const person = assertCan(state, "admin");
  const take = state.stocktakes.find((item) => item.id === takeId);
  if (!take || take.status !== "Counting") throw new Error("Only a counting stocktake can be approved.");
  for (const line of take.lines) {
    if (!Number.isInteger(line.counted) || line.counted < 0) {
      throw new Error("Every batch count must be a whole number of zero or more.");
    }
    if (line.variance !== 0 && !line.reason.trim()) {
      throw new Error("Add a discrepancy reason for every variance before approval.");
    }
  }
  const timestamp = ctx.now().toISOString();
  const batches = state.batches.map((batch) => {
    const line = take.lines.find((item) => item.batchId === batch.id);
    return line ? { ...batch, quantityRemaining: line.counted } : batch;
  });
  const movements: Movement[] = [];
  for (const line of take.lines) {
    const before = state.batches.find((batch) => batch.id === line.batchId);
    if (!before) continue;
    const difference = line.counted - before.quantityRemaining;
    if (!difference) continue;
    movements.push({
      id: ctx.id("mov"),
      medicineId: before.medicineId,
      batchId: before.id,
      type: "Stocktake adjustment",
      quantityChange: difference,
      previousQuantity: before.quantityRemaining,
      newQuantity: line.counted,
      reason: line.reason.trim() || `Approved stocktake ${takeId}`,
      performedBy: person.id,
      timestamp,
      reference: takeId,
    });
  }
  const approved: Stocktake = { ...take, status: "Approved", approvedAt: timestamp };
  return appendAudit(
    {
      ...state,
      batches,
      movements: [...movements, ...state.movements],
      stocktakes: state.stocktakes.map((item) => (item.id === takeId ? approved : item)),
    },
    ctx,
    {
      action: "Approve",
      module: "Stocktaking",
      entityType: "Stocktake",
      entityId: takeId,
      description: `Approved stocktake; applied ${movements.length} batch adjustment(s).`,
      before: take,
      after: approved,
    },
  );
}

export function updateEmployeeRole(state: State, employeeId: string, role: Role, ctx: DomainContext): State {
  assertCan(state, "admin");
  if (employeeId === state.sessionId) throw new Error("You cannot change the signed-in account.");
  const previous = state.employees.find((employee) => employee.id === employeeId);
  if (!previous) throw new Error("Employee not found.");
  const next: Person = { ...previous, role };
  return appendAudit(
    { ...state, employees: state.employees.map((employee) => (employee.id === employeeId ? next : employee)) },
    ctx,
    {
      action: "Permission change",
      module: "Employees",
      entityType: "Employee",
      entityId: employeeId,
      description: `Changed ${previous.name} role to ${role}.`,
      before: previous,
      after: next,
    },
  );
}

export function setEmployeeActive(state: State, employeeId: string, active: boolean, ctx: DomainContext): State {
  assertCan(state, "admin");
  if (employeeId === state.sessionId) throw new Error("You cannot deactivate the signed-in account.");
  const previous = state.employees.find((employee) => employee.id === employeeId);
  if (!previous) throw new Error("Employee not found.");
  const next: Person = { ...previous, active };
  return appendAudit(
    { ...state, employees: state.employees.map((employee) => (employee.id === employeeId ? next : employee)) },
    ctx,
    {
      action: "Permission change",
      module: "Employees",
      entityType: "Employee",
      entityId: employeeId,
      description: `${active ? "Activated" : "Deactivated"} ${previous.name}.`,
      before: previous,
      after: next,
    },
  );
}

export function updateSettings(state: State, settings: State["settings"], ctx: DomainContext): State {
  assertCan(state, "admin");
  const next = {
    ...settings,
    lowStockThreshold: Number(settings.lowStockThreshold),
    expiryWarningDays: Number(settings.expiryWarningDays),
  };
  return appendAudit(
    { ...state, settings: next },
    ctx,
    {
      action: "Update",
      module: "Settings",
      entityType: "Settings",
      entityId: "profile",
      description: "Updated pharmacy settings.",
      before: state.settings,
      after: next,
    },
  );
}

export function acknowledgeAlert(state: State, alertId: string, ctx: DomainContext): State {
  assertCan(state, "overview");
  if (state.alertsAcknowledged.includes(alertId)) return state;
  return appendAudit(
    { ...state, alertsAcknowledged: [...state.alertsAcknowledged, alertId] },
    ctx,
    {
      action: "Acknowledge",
      module: "Alerts",
      entityType: "Alert",
      entityId: alertId,
      description: `Acknowledged alert ${alertId}.`,
    },
  );
}

export function recordAudit(
  state: State,
  fields: Omit<AuditEvent, "id" | "timestamp" | "userId" | "role" | "outcome">,
  ctx: DomainContext,
): State {
  requireActor(state);
  return appendAudit(state, ctx, fields);
}

export function availableUnits(medicineId: string, state: State, now = new Date()): number {
  return availableStock(medicineId, state, now);
}

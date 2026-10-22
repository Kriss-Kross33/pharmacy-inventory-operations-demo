import { describe, expect, it } from "vitest";
import { createLocalStorageRepository, STORAGE_KEY } from "./local-storage-repository";
import { availableStock, deriveAlerts, reportForRange, stockStatus } from "./queries";
import { createDomainContext, emptyState } from "./seed";
import {
  addMedicine,
  approveStocktake,
  completeSale,
  createPurchase,
  login,
  receivePurchase,
  receiveStockIn,
  startStocktake,
  updateMedicine,
  updateStocktakeCount,
} from "./services";
import type { State } from "./types";

function signedIn(state: State = emptyState()) {
  const ctx = createDomainContext(new Date("2026-10-01T09:00:00.000Z"));
  return { ctx, state: login(state, "emp-ama", ctx) };
}

function receiveOpening(state: State, ctx: ReturnType<typeof createDomainContext>, medicineId = "med-001", quantity = 40) {
  const withDraft = createPurchase(
    state,
    {
      supplierId: "sup-1",
      invoiceNumber: "INV-TEST",
      purchaseDate: ctx.now().toISOString().slice(0, 10),
      items: [
        {
          medicineId,
          batchNumber: "BATCH-OPEN-1",
          quantity,
          unitCost: 200,
          expiryDate: "2027-12-01",
        },
      ],
      total: quantity * 200,
      notes: "Test opening stock",
    },
    ctx,
  );
  return receivePurchase(withDraft, withDraft.purchases[0].id, ctx);
}

describe("shared pharmacy domain", () => {
  it("completes a sale as one snapshot: stock, movement, sale and audit", () => {
    const { ctx, state: opened } = signedIn();
    const stocked = receiveOpening(opened, ctx, "med-001", 40);
    const before = availableStock("med-001", stocked, ctx.now());
    const auditBefore = stocked.audit.length;
    const { state, sale } = completeSale(
      stocked,
      {
        items: [{ medicineId: "med-001", quantity: 3, unit: "tablet", conversion: 1 }],
        paymentMethod: "Cash",
        requestId: "req-1",
      },
      ctx,
    );

    expect(availableStock("med-001", state, ctx.now())).toBe(before - 3);
    expect(state.sales[0].id).toBe(sale.id);
    expect(sale.items[0].allocations.reduce((sum, item) => sum + item.quantity, 0)).toBe(3);
    expect(state.movements.filter((movement) => movement.reference === sale.receiptNumber)).toHaveLength(1);
    expect(state.movements[0].quantityChange).toBe(-3);
    expect(state.audit).toHaveLength(auditBefore + 1);
    expect(state.audit[0].action).toBe("Sale");
    expect(state.audit[0].entityId).toBe(sale.id);
  });

  it("rejects invalid stock deductions and leaves state unchanged", () => {
    const { ctx, state: opened } = signedIn();
    const stocked = receiveOpening(opened, ctx, "med-001", 2);
    const snapshot = structuredClone(stocked);
    expect(() =>
      completeSale(
        stocked,
        {
          items: [{ medicineId: "med-001", quantity: 5, unit: "tablet", conversion: 1 }],
          paymentMethod: "Cash",
        },
        ctx,
      ),
    ).toThrow(/Insufficient unexpired stock/);
    expect(stocked).toEqual(snapshot);
  });

  it("does not double-deduct a duplicate sale request", () => {
    const { ctx, state: opened } = signedIn();
    const stocked = receiveOpening(opened, ctx, "med-001", 20);
    const first = completeSale(
      stocked,
      {
        items: [{ medicineId: "med-001", quantity: 2, unit: "tablet", conversion: 1 }],
        paymentMethod: "Cash",
        requestId: "same-request",
      },
      ctx,
    );
    const second = completeSale(
      first.state,
      {
        items: [{ medicineId: "med-001", quantity: 2, unit: "tablet", conversion: 1 }],
        paymentMethod: "Cash",
        requestId: "same-request",
      },
      ctx,
    );
    expect(second.sale.id).toBe(first.sale.id);
    expect(second.state.sales).toHaveLength(first.state.sales.length);
    expect(availableStock("med-001", second.state, ctx.now())).toBe(availableStock("med-001", first.state, ctx.now()));
  });

  it("blocks unauthorized stock changes", () => {
    const ctx = createDomainContext();
    const viewer = login(emptyState(), "emp-daniel", ctx);
    expect(() =>
      completeSale(
        viewer,
        { items: [{ medicineId: "med-001", quantity: 1, unit: "tablet", conversion: 1 }], paymentMethod: "Cash" },
        ctx,
      ),
    ).toThrow(/permission/);
    expect(() =>
      createPurchase(
        viewer,
        {
          supplierId: "sup-1",
          purchaseDate: "2026-10-01",
          items: [{ medicineId: "med-001", batchNumber: "X", quantity: 1, unitCost: 1, expiryDate: "2027-01-01" }],
          total: 1,
          notes: "",
          invoiceNumber: "",
        },
        ctx,
      ),
    ).toThrow(/permission/);
  });

  it("receiving a purchase updates batches, movements and audit together", () => {
    const { ctx, state: opened } = signedIn();
    const beforeBatches = opened.batches.length;
    const received = receiveOpening(opened, ctx, "med-003", 12);
    const batch = received.batches.find((item) => item.batchNumber === "BATCH-OPEN-1");
    expect(received.batches.length).toBe(beforeBatches + 1);
    expect(batch?.quantityRemaining).toBe(12);
    expect(received.purchases[0].status).toBe("Received");
    expect(received.movements[0].type).toBe("Purchase receipt");
    expect(received.movements[0].quantityChange).toBe(12);
    expect(received.audit[0].action).toBe("Receive");
    expect(availableStock("med-003", received, ctx.now())).toBe(12);
  });

  it("records before-and-after values for a price change", () => {
    const { ctx, state } = signedIn();
    const medicine = state.medicines.find((item) => item.id === "med-001");
    const next = updateMedicine(state, "med-001", { sellingPrice: 999 }, ctx);
    const updated = next.medicines.find((item) => item.id === "med-001");
    expect(updated?.sellingPrice).toBe(999);
    expect(next.audit[0].action).toBe("Price change");
    expect((next.audit[0].before as { sellingPrice: number }).sellingPrice).toBe(medicine?.sellingPrice);
    expect((next.audit[0].after as { sellingPrice: number }).sellingPrice).toBe(999);
  });

  it("derives low-stock alerts from the actual remaining batches", () => {
    const { ctx, state: opened } = signedIn();
    const medicine = opened.medicines.find((item) => item.id === "med-001")!;
    const stocked = receiveOpening(opened, ctx, "med-001", medicine.reorderThreshold);
    const afterSale = completeSale(
      stocked,
      {
        items: [{ medicineId: "med-001", quantity: 1, unit: "tablet", conversion: 1 }],
        paymentMethod: "Mobile Money",
      },
      ctx,
    ).state;
    expect(stockStatus(medicine, afterSale, ctx.now())).toBe("Low stock");
    const alerts = deriveAlerts(afterSale, ctx.now());
    expect(alerts.some((alert) => alert.id === "low-med-001")).toBe(true);
  });

  it("calculates reports from shared sales and remaining inventory", () => {
    const { ctx, state: opened } = signedIn();
    const stocked = receiveOpening(opened, ctx, "med-001", 30);
    const sold = completeSale(
      stocked,
      {
        items: [{ medicineId: "med-001", quantity: 4, unit: "tablet", conversion: 1 }],
        paymentMethod: "Card",
      },
      ctx,
    ).state;
    const day = ctx.now().toISOString().slice(0, 10);
    const report = reportForRange(sold, day, day);
    expect(report.transactionCount).toBe(1);
    expect(report.revenue).toBe(sold.sales[0].total);
    expect(report.cost).toBe(4 * 200);
    expect(report.inventoryValuation).toBe(availableStock("med-001", sold, ctx.now()) * 200);
  });

  it("creates a non-medicine item without requiring medicine-only fields", () => {
    const { ctx, state } = signedIn();
    const next = addMedicine(
      state,
      {
        name: "Cotton Wool 100g",
        itemType: "medical_supply",
        category: "Wound care",
        brandName: "ClinicPack",
        baseUnit: "pack",
        sellingPrice: 900,
        reorderThreshold: 12,
        trackBatches: true,
        trackExpiry: false,
      },
      ctx,
    );
    const created = next.medicines[0];
    expect(created.itemType).toBe("medical_supply");
    expect(created.genericName).toBe("");
    expect(created.regulatoryClassification).toBe("Not applicable");
    expect(created.imageDataUrl).toBe("");
    expect(next.audit[0].entityType).toBe("Item");
  });

  it("stores an item photo on the shared catalog record", () => {
    const { ctx, state } = signedIn();
    const imageDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const createdState = addMedicine(
      state,
      {
        name: "Shelf photo wipes",
        itemType: "baby_care",
        category: "Baby toiletries",
        baseUnit: "pack",
        sellingPrice: 1500,
        imageDataUrl,
      },
      ctx,
    );
    const created = createdState.medicines[0];
    expect(created.imageDataUrl).toBe(imageDataUrl);
    const cleared = updateMedicine(createdState, created.id, { imageDataUrl: "" }, ctx);
    expect(cleared.medicines.find((item) => item.id === created.id)?.imageDataUrl).toBe("");
  });

  it("rejects a medicine that is missing required clinical fields", () => {
    const { ctx, state } = signedIn();
    expect(() =>
      addMedicine(state, { name: "Incomplete tablet", itemType: "medicine", category: "General", sellingPrice: 100 }, ctx),
    ).toThrow(/Generic name/);
  });

  it("posts a multi-item stock-in as one snapshot and ignores a duplicate request", () => {
    const { ctx, state: opened } = signedIn();
    const first = receiveStockIn(
      opened,
      {
        supplierId: "sup-1",
        invoiceNumber: "INV-STOCKIN-1",
        purchaseDate: "2026-10-01",
        requestId: "stockin-req-1",
        items: [
          { medicineId: "med-001", quantity: 10, unit: "tablet", conversion: 1, unitCost: 200, batchNumber: "SI-A", expiryDate: "2027-11-01" },
          { medicineId: "med-012", quantity: 4, unit: "piece", conversion: 1, unitCost: 1500, batchNumber: "", expiryDate: "" },
        ],
      },
      ctx,
    );
    expect(first.purchase.status).toBe("Received");
    expect(availableStock("med-001", first.state, ctx.now())).toBe(10);
    expect(availableStock("med-012", first.state, ctx.now())).toBe(4);
    expect(first.state.movements.filter((movement) => movement.reference === first.purchase.reference)).toHaveLength(2);
    expect(first.state.audit[0].action).toBe("Stock in");
    const second = receiveStockIn(
      first.state,
      {
        supplierId: "sup-1",
        invoiceNumber: "INV-STOCKIN-1-RETRY",
        purchaseDate: "2026-10-01",
        requestId: "stockin-req-1",
        items: [{ medicineId: "med-001", quantity: 10, unit: "tablet", conversion: 1, unitCost: 200, batchNumber: "SI-A", expiryDate: "2027-11-01" }],
      },
      ctx,
    );
    expect(second.purchase.id).toBe(first.purchase.id);
    expect(availableStock("med-001", second.state, ctx.now())).toBe(10);
    expect(() =>
      receiveStockIn(
        first.state,
        {
          supplierId: "sup-1",
          invoiceNumber: "INV-STOCKIN-1",
          purchaseDate: "2026-10-02",
          items: [{ medicineId: "med-001", quantity: 2, unit: "tablet", conversion: 1, unitCost: 200, batchNumber: "SI-B", expiryDate: "2027-12-01" }],
        },
        ctx,
      ),
    ).toThrow(/already been posted/);
  });

  it("requires discrepancy reasons and CEO approval before a stocktake changes stock", () => {
    const { ctx, state: opened } = signedIn();
    const stocked = receiveOpening(opened, ctx, "med-001", 20);
    const counting = startStocktake(stocked, ctx);
    const take = counting.stocktakes[0];
    const batch = counting.batches.find((item) => item.medicineId === "med-001")!;
    expect(() => approveStocktake(updateStocktakeCount(counting, take.id, batch.id, 17, ctx), take.id, ctx)).toThrow(
      /discrepancy reason/,
    );
    const explained = updateStocktakeCount(counting, take.id, batch.id, 17, ctx, "Broken blister pack");
    const approved = approveStocktake(explained, take.id, ctx);
    expect(availableStock("med-001", approved, ctx.now())).toBe(17);
    expect(approved.movements[0].type).toBe("Stocktake adjustment");
    expect(approved.movements[0].reason).toBe("Broken blister pack");
    expect(approved.audit[0].action).toBe("Approve");
    expect(approved.stocktakes[0].status).toBe("Approved");
  });
});

describe("localStorage repository", () => {
  it("persists a completed sale and reloads the same snapshot", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    const first = createLocalStorageRepository(storage);
    first.login("emp-ama");
    first.createPurchase({
      supplierId: "sup-1",
      invoiceNumber: "",
      purchaseDate: "2026-10-01",
      items: [{ medicineId: "med-001", batchNumber: "LS-1", quantity: 10, unitCost: 150, expiryDate: "2027-10-01" }],
      total: 1500,
      notes: "",
    });
    const purchaseId = first.getState().purchases[0].id;
    first.receivePurchase(purchaseId);
    const stockBefore = availableStock("med-001", first.getState());
    const sale = first.completeSale({
      items: [{ medicineId: "med-001", quantity: 2, unit: "tablet", conversion: 1 }],
      paymentMethod: "Cash",
      requestId: "persist-1",
    });
    expect(memory.get(STORAGE_KEY)).toBeTruthy();

    const reloaded = createLocalStorageRepository(storage);
    expect(reloaded.getState().sales[0].id).toBe(sale.id);
    expect(availableStock("med-001", reloaded.getState())).toBe(stockBefore - 2);
  });

  it("does not apply a mutation when storage write fails", () => {
    const memory = new Map<string, string>();
    let failWrites = false;
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) throw new Error("quota");
        memory.set(key, value);
      },
    };
    const repo = createLocalStorageRepository(storage);
    repo.login("emp-ama");
    repo.createPurchase({
      supplierId: "sup-1",
      invoiceNumber: "",
      purchaseDate: "2026-10-01",
      items: [{ medicineId: "med-001", batchNumber: "LS-2", quantity: 10, unitCost: 150, expiryDate: "2027-10-01" }],
      total: 1500,
      notes: "",
    });
    repo.receivePurchase(repo.getState().purchases[0].id);
    const before = structuredClone(repo.getState());
    failWrites = true;
    expect(() =>
      repo.completeSale({
        items: [{ medicineId: "med-001", quantity: 1, unit: "tablet", conversion: 1 }],
        paymentMethod: "Cash",
      }),
    ).toThrow(/could not be saved/);
    expect(repo.getState()).toEqual(before);
    expect(repo.getStorageError()).toMatch(/could not be saved/);
  });
});

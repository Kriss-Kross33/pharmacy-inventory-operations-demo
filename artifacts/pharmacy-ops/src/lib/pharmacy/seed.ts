import { completeSale, createPurchase, login, logout, receivePurchase } from "./services";
import type { DomainContext, Medicine, Person, State, Supplier } from "./types";
import { STATE_VERSION } from "./types";

const names = [
  ["Paracetamol 500mg Tablets", "Paracetamol", "Panadol", "500 mg", "Tablet", "Analgesics"],
  ["Amoxicillin 500mg Capsules", "Amoxicillin", "Amoxil", "500 mg", "Capsule", "Antibiotics"],
  ["Artemether/Lumefantrine 20/120mg", "Artemether/Lumefantrine", "Lumartem", "20/120 mg", "Tablet", "Antimalarials"],
  ["ORS Sachets", "Oral rehydration salts", "ORS", "20.5 g", "Sachet", "Gastrointestinal"],
  ["Cetirizine 10mg Tablets", "Cetirizine", "Zyrtec", "10 mg", "Tablet", "Allergy"],
  ["Ibuprofen 400mg Tablets", "Ibuprofen", "Brufen", "400 mg", "Tablet", "Analgesics"],
  ["Metformin 500mg Tablets", "Metformin", "Glucophage", "500 mg", "Tablet", "Diabetes"],
  ["Amlodipine 5mg Tablets", "Amlodipine", "Norvasc", "5 mg", "Tablet", "Cardiovascular"],
  ["Omeprazole 20mg Capsules", "Omeprazole", "Losec", "20 mg", "Capsule", "Gastrointestinal"],
  ["Vitamin C 1000mg Tablets", "Ascorbic acid", "Cevit", "1000 mg", "Tablet", "Vitamins"],
] as const;

const supplierNames = [
  "MediPlus Ghana Ltd",
  "Ernest Chemists",
  "Kinapharma Limited",
  "Tobinco Pharmaceuticals",
  "Pharma Health Ghana",
  "Danadams Pharmaceuticals",
  "Stavem Medical Supplies",
  "Löwenberg Medical",
  "Unichem Ghana",
  "Apex Medical Stores",
  "Crown Healthcare",
  "Sunda International",
];

export function createDomainContext(start = new Date("2026-04-10T08:00:00.000Z")): DomainContext & {
  advance: (minutes: number) => void;
  setNow: (date: Date) => void;
} {
  let sequence = 0;
  let timestamp = start.getTime();
  return {
    now: () => new Date(timestamp),
    id: (prefix) => `${prefix}-${++sequence}`,
    advance(minutes: number) {
      timestamp += minutes * 60_000;
    },
    setNow(date: Date) {
      timestamp = date.getTime();
    },
  };
}

function catalog(): { employees: Person[]; suppliers: Supplier[]; medicines: Medicine[] } {
  const employees: Person[] = [
    { id: "emp-ama", name: "Ama Mensah", role: "Administrator", active: true },
    { id: "emp-daniel", name: "Daniel Owusu", role: "Inventory Viewer", active: true },
    { id: "emp-akosua", name: "Akosua Boateng", role: "Sales Operator", active: true },
  ];
  const suppliers: Supplier[] = supplierNames.map((name, index) => ({
    id: `sup-${index + 1}`,
    name,
    contactPerson: ["Nana Kofi", "Abena Osei", "Kwame Asare"][index % 3],
    phone: `+233 24 ${String(3100000 + index * 739).slice(0, 6)}`,
    email: `orders@${name.toLowerCase().replace(/[^a-z]/g, "")}.gh`,
    address: ["North Industrial Area, Accra", "Adum, Kumasi", "Ring Road Central, Accra"][index % 3],
    notes: "Approved local pharmaceutical supplier.",
    active: true,
  }));
  const medicines: Medicine[] = Array.from({ length: 60 }, (_, index) => {
    const details = names[index % names.length];
    const suffix = index >= 10 ? ` — ${["Adult", "Paediatric", "Dispersible", "Extra", "Plus"][index % 5]}` : "";
    const baseUnit = details[4].toLowerCase();
    const sellingUnits =
      baseUnit === "tablet" || baseUnit === "capsule"
        ? [
            { name: baseUnit, conversion: 1 },
            { name: "strip", conversion: 10 },
            { name: "box", conversion: 100 },
          ]
        : [
            { name: baseUnit, conversion: 1 },
            { name: "pack", conversion: 10 },
            { name: "case", conversion: 100 },
          ];
    return {
      id: `med-${String(index + 1).padStart(3, "0")}`,
      name: details[0] + suffix,
      genericName: details[1],
      brandName: details[2],
      strength: details[3],
      dosageForm: details[4],
      category: details[5],
      manufacturer: ["Ernest Chemists", "Kinapharma", "Danadams", "M&G Pharmaceuticals"][index % 4],
      barcode: `6161100${String(100000 + index).slice(-6)}`,
      description: `${details[1]} ${details[3]} ${details[4].toLowerCase()} for pharmacy dispensing.`,
      baseUnit,
      sellingUnits,
      sellingPrice: [350, 1200, 2800, 500, 900, 750, 600, 850, 1100, 1400][index % 10],
      reorderThreshold: [25, 30, 15, 20, 18, 24, 20, 15, 16, 20][index % 10],
      active: true,
      createdAt: "2024-01-10T08:00:00.000Z",
      updatedAt: "2026-04-01T08:00:00.000Z",
    };
  });
  return { employees, suppliers, medicines };
}

export function emptyState(): State {
  const { employees, suppliers, medicines } = catalog();
  return {
    version: STATE_VERSION,
    sessionId: null,
    employees,
    medicines,
    batches: [],
    suppliers,
    sales: [],
    movements: [],
    purchases: [],
    stocktakes: [],
    audit: [],
    settings: {
      pharmacyName: "Adom Community Pharmacy",
      address: "Osu, Accra, Ghana",
      phone: "+233 30 277 4192",
      lowStockThreshold: 20,
      expiryWarningDays: 90,
      currency: "GH₵",
      dateFormat: "DD MMM YYYY",
      density: "Comfortable",
    },
    alertsAcknowledged: [],
  };
}

export function buildSeed(ctx?: ReturnType<typeof createDomainContext>): State {
  const now = ctx?.now() ?? new Date();
  const start = new Date(now.getTime() - 100 * 86400000);
  const clock = ctx ?? createDomainContext(start);
  if (!ctx) clock.setNow(start);
  let state = login(emptyState(), "emp-ama", clock);
  const linesBySupplier = new Map<string, Array<{
    medicineId: string;
    batchNumber: string;
    quantity: number;
    unitCost: number;
    expiryDate: string;
  }>>();

  for (const [index, medicine] of state.medicines.entries()) {
    for (const copy of [0, 1]) {
      const supplierId = `sup-${((index + copy) % 12) + 1}`;
      const expired = index === 4 && copy === 1;
      const soon = index === 2 && copy === 0;
      const quantity = index === 1 && copy === 1 ? 0 : index % 9 === 0 && copy === 0 ? 8 : 80 + ((index * 7 + copy * 11) % 40);
      const expiry = new Date(Date.UTC(2027, (index + copy * 4) % 12, 12 + (index % 15)));
      if (expired) expiry.setUTCFullYear(2025, 3, 12);
      if (soon) expiry.setUTCMonth(6);
      const lines = linesBySupplier.get(supplierId) || [];
      if (quantity > 0) {
        lines.push({
          medicineId: medicine.id,
          batchNumber: `GH${2026 + copy}${String(index + 1).padStart(4, "0")}`,
          quantity,
          unitCost: Math.round(medicine.sellingPrice * 0.56),
          expiryDate: expiry.toISOString().slice(0, 10),
        });
        linesBySupplier.set(supplierId, lines);
      }
    }
  }

  for (const [supplierId, items] of linesBySupplier) {
    clock.advance(15);
    const total = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    state = createPurchase(
      state,
      {
        supplierId,
        invoiceNumber: `INV-${supplierId.slice(-2)}`,
        purchaseDate: clock.now().toISOString().slice(0, 10),
        items,
        total,
        notes: "Opening supplier stock.",
      },
      clock,
    );
    const draft = state.purchases[0];
    state = receivePurchase(state, draft.id, clock);
  }

  for (let index = 0; index < 48; index += 1) {
    clock.setNow(new Date(now.getTime() - (47 - index) * 1.7 * 86400000));
    const medicine = state.medicines[(index * 7 + 3) % state.medicines.length];
    const quantity = (index % 3) + 1;
    try {
      state = completeSale(
        state,
        {
          items: [{ medicineId: medicine.id, quantity, unit: medicine.baseUnit, conversion: 1 }],
          paymentMethod: ["Cash", "Mobile Money", "Card"][index % 3],
          requestId: `seed-sale-${index + 1}`,
        },
        clock,
      ).state;
    } catch {
      // Skip medicines whose remaining sellable stock cannot cover the requested units.
    }
  }

  return logout(state, clock);
}

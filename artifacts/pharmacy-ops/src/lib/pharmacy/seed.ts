import { completeSale, createPurchase, login, logout, receivePurchase } from "./services";
import type { DomainContext, Item, ItemType, Person, State, Supplier } from "./types";
import { STATE_VERSION } from "./types";

type CatalogSeed = {
  name: string;
  itemType: ItemType;
  category: string;
  brandName: string;
  manufacturer: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  prescriptionRequired?: boolean;
  regulatoryClassification?: string;
  baseUnit: string;
  sellingPrice: number;
  reorderThreshold: number;
  trackBatches?: boolean;
  trackExpiry?: boolean;
  description: string;
};

const catalogSeeds: CatalogSeed[] = [
  { name: "Paracetamol 500mg Tablets", itemType: "medicine", category: "Analgesics", brandName: "Panadol", manufacturer: "Ernest Chemists", genericName: "Paracetamol", strength: "500 mg", dosageForm: "Tablet", regulatoryClassification: "OTC", baseUnit: "tablet", sellingPrice: 350, reorderThreshold: 25, description: "Paracetamol 500 mg tablet for pharmacy dispensing." },
  { name: "Amoxicillin 500mg Capsules", itemType: "medicine", category: "Antibiotics", brandName: "Amoxil", manufacturer: "Kinapharma", genericName: "Amoxicillin", strength: "500 mg", dosageForm: "Capsule", prescriptionRequired: true, regulatoryClassification: "POM", baseUnit: "capsule", sellingPrice: 1200, reorderThreshold: 30, description: "Amoxicillin 500 mg capsule for pharmacy dispensing." },
  { name: "Artemether/Lumefantrine 20/120mg", itemType: "medicine", category: "Antimalarials", brandName: "Lumartem", manufacturer: "Danadams", genericName: "Artemether/Lumefantrine", strength: "20/120 mg", dosageForm: "Tablet", prescriptionRequired: true, regulatoryClassification: "POM", baseUnit: "tablet", sellingPrice: 2800, reorderThreshold: 15, description: "Artemether/Lumefantrine 20/120 mg tablet for pharmacy dispensing." },
  { name: "ORS Sachets", itemType: "medicine", category: "Gastrointestinal", brandName: "ORS", manufacturer: "M&G Pharmaceuticals", genericName: "Oral rehydration salts", strength: "20.5 g", dosageForm: "Sachet", regulatoryClassification: "OTC", baseUnit: "sachet", sellingPrice: 500, reorderThreshold: 20, description: "Oral rehydration salts 20.5 g sachet for pharmacy dispensing." },
  { name: "Cetirizine 10mg Tablets", itemType: "medicine", category: "Allergy", brandName: "Zyrtec", manufacturer: "Ernest Chemists", genericName: "Cetirizine", strength: "10 mg", dosageForm: "Tablet", regulatoryClassification: "OTC", baseUnit: "tablet", sellingPrice: 900, reorderThreshold: 18, description: "Cetirizine 10 mg tablet for pharmacy dispensing." },
  { name: "Ibuprofen 400mg Tablets", itemType: "medicine", category: "Analgesics", brandName: "Brufen", manufacturer: "Kinapharma", genericName: "Ibuprofen", strength: "400 mg", dosageForm: "Tablet", regulatoryClassification: "OTC", baseUnit: "tablet", sellingPrice: 750, reorderThreshold: 24, description: "Ibuprofen 400 mg tablet for pharmacy dispensing." },
  { name: "Metformin 500mg Tablets", itemType: "medicine", category: "Diabetes", brandName: "Glucophage", manufacturer: "Danadams", genericName: "Metformin", strength: "500 mg", dosageForm: "Tablet", prescriptionRequired: true, regulatoryClassification: "POM", baseUnit: "tablet", sellingPrice: 600, reorderThreshold: 20, description: "Metformin 500 mg tablet for pharmacy dispensing." },
  { name: "Amlodipine 5mg Tablets", itemType: "medicine", category: "Cardiovascular", brandName: "Norvasc", manufacturer: "M&G Pharmaceuticals", genericName: "Amlodipine", strength: "5 mg", dosageForm: "Tablet", prescriptionRequired: true, regulatoryClassification: "POM", baseUnit: "tablet", sellingPrice: 850, reorderThreshold: 15, description: "Amlodipine 5 mg tablet for pharmacy dispensing." },
  { name: "Omeprazole 20mg Capsules", itemType: "medicine", category: "Gastrointestinal", brandName: "Losec", manufacturer: "Ernest Chemists", genericName: "Omeprazole", strength: "20 mg", dosageForm: "Capsule", prescriptionRequired: true, regulatoryClassification: "POM", baseUnit: "capsule", sellingPrice: 1100, reorderThreshold: 16, description: "Omeprazole 20 mg capsule for pharmacy dispensing." },
  { name: "Vitamin C 1000mg Tablets", itemType: "medicine", category: "Vitamins", brandName: "Cevit", manufacturer: "Kinapharma", genericName: "Ascorbic acid", strength: "1000 mg", dosageForm: "Tablet", regulatoryClassification: "OTC", baseUnit: "tablet", sellingPrice: 1400, reorderThreshold: 20, description: "Ascorbic acid 1000 mg tablet for pharmacy dispensing." },
  { name: "Sterile Gauze Pads 10x10cm", itemType: "medical_supply", category: "Wound care", brandName: "MediDress", manufacturer: "Stavem Medical Supplies", baseUnit: "pad", sellingPrice: 250, reorderThreshold: 40, description: "Sterile gauze pads for wound dressing." },
  { name: "Digital Thermometer", itemType: "medical_supply", category: "Diagnostics", brandName: "CareTemp", manufacturer: "Löwenberg Medical", baseUnit: "piece", sellingPrice: 4500, reorderThreshold: 8, trackBatches: false, trackExpiry: false, description: "Oral digital thermometer for retail sale." },
  { name: "Nitrile Examination Gloves", itemType: "medical_supply", category: "PPE", brandName: "SafeHands", manufacturer: "Crown Healthcare", baseUnit: "pair", sellingPrice: 180, reorderThreshold: 50, description: "Powder-free nitrile examination gloves." },
  { name: "Omega-3 Softgels", itemType: "supplement", category: "Nutrition", brandName: "OceanPlus", manufacturer: "Pharma Health Ghana", baseUnit: "softgel", sellingPrice: 1600, reorderThreshold: 18, description: "Omega-3 fish oil softgels." },
  { name: "Multivitamin Gummies", itemType: "supplement", category: "Vitamins", brandName: "DailyOne", manufacturer: "Apex Medical Stores", baseUnit: "gummy", sellingPrice: 2200, reorderThreshold: 16, description: "Daily multivitamin gummies." },
  { name: "Zinc 20mg Tablets", itemType: "supplement", category: "Minerals", brandName: "Zinmax", manufacturer: "Danadams", genericName: "Zinc sulfate", strength: "20 mg", dosageForm: "Tablet", regulatoryClassification: "Not applicable", baseUnit: "tablet", sellingPrice: 800, reorderThreshold: 22, description: "Zinc 20 mg supplement tablets." },
  { name: "Fluoride Toothpaste 100ml", itemType: "personal_care", category: "Oral care", brandName: "BrightSmile", manufacturer: "Sunda International", baseUnit: "tube", sellingPrice: 1800, reorderThreshold: 12, trackBatches: false, description: "Fluoride toothpaste 100 ml." },
  { name: "Antiseptic Hand Wash 250ml", itemType: "personal_care", category: "Hygiene", brandName: "CleanCare", manufacturer: "Unichem Ghana", baseUnit: "bottle", sellingPrice: 2400, reorderThreshold: 10, description: "Antiseptic hand wash 250 ml." },
  { name: "Body Lotion 400ml", itemType: "personal_care", category: "Skin care", brandName: "SoftDay", manufacturer: "Sunda International", baseUnit: "bottle", sellingPrice: 3200, reorderThreshold: 10, trackBatches: false, trackExpiry: false, description: "Daily moisturising body lotion." },
  { name: "Size 3 Diapers 32-pack", itemType: "baby_care", category: "Diapers", brandName: "TinySoft", manufacturer: "Sunda International", baseUnit: "pack", sellingPrice: 6500, reorderThreshold: 8, trackBatches: false, trackExpiry: false, description: "Size 3 disposable diapers, 32-count pack." },
  { name: "Infant Formula Stage 1 400g", itemType: "baby_care", category: "Infant formula", brandName: "Nurture", manufacturer: "Apex Medical Stores", baseUnit: "tin", sellingPrice: 9800, reorderThreshold: 6, description: "Stage 1 infant formula 400 g." },
  { name: "Baby Wipes 80-count", itemType: "baby_care", category: "Baby toiletries", brandName: "GentleWipe", manufacturer: "Sunda International", baseUnit: "pack", sellingPrice: 2100, reorderThreshold: 14, trackBatches: false, trackExpiry: false, description: "Fragrance-light baby wipes, 80-count." },
  { name: "Bottled Water 1.5L", itemType: "general_retail", category: "Beverages", brandName: "Voltic", manufacturer: "Voltic Ghana", baseUnit: "bottle", sellingPrice: 600, reorderThreshold: 24, trackBatches: false, trackExpiry: false, description: "Still bottled water 1.5 litres." },
  { name: "Glucose Biscuits 150g", itemType: "general_retail", category: "Snacks", brandName: "Peak", manufacturer: "Local wholesale", baseUnit: "pack", sellingPrice: 750, reorderThreshold: 18, trackBatches: false, description: "Glucose biscuits 150 g." },
  { name: "Laundry Bar Soap", itemType: "general_retail", category: "Household", brandName: "Key", manufacturer: "Local wholesale", baseUnit: "bar", sellingPrice: 900, reorderThreshold: 16, trackBatches: false, trackExpiry: false, description: "Household laundry bar soap." },
];

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

function sellingUnitsFor(baseUnit: string) {
  if (baseUnit === "tablet" || baseUnit === "capsule" || baseUnit === "softgel" || baseUnit === "gummy") {
    return [
      { name: baseUnit, conversion: 1 },
      { name: "strip", conversion: 10 },
      { name: "box", conversion: 100 },
    ];
  }
  return [
    { name: baseUnit, conversion: 1 },
    { name: "pack", conversion: 10 },
    { name: "case", conversion: 100 },
  ];
}

function catalog(): { employees: Person[]; suppliers: Supplier[]; medicines: Item[] } {
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
    notes: "Approved local supplier.",
    active: true,
  }));
  const medicines: Item[] = catalogSeeds.map((details, index) => ({
    id: `med-${String(index + 1).padStart(3, "0")}`,
    name: details.name,
    itemType: details.itemType,
    category: details.category,
    brandName: details.brandName,
    manufacturer: details.manufacturer,
    barcode: `6161100${String(100000 + index).slice(-6)}`,
    description: details.description,
    genericName: details.genericName || "",
    strength: details.strength || "",
    dosageForm: details.dosageForm || "",
    prescriptionRequired: Boolean(details.prescriptionRequired),
    regulatoryClassification: details.regulatoryClassification || (details.itemType === "medicine" ? "OTC" : "Not applicable"),
    baseUnit: details.baseUnit,
    sellingUnits: sellingUnitsFor(details.baseUnit),
    sellingPrice: details.sellingPrice,
    reorderThreshold: details.reorderThreshold,
    trackBatches: details.trackBatches !== false,
    trackExpiry: details.trackExpiry !== false,
    imageDataUrl: "",
    active: true,
    createdAt: "2024-01-10T08:00:00.000Z",
    updatedAt: "2026-04-01T08:00:00.000Z",
  }));
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

  for (const [index, item] of state.medicines.entries()) {
    for (const copy of [0, 1]) {
      const supplierId = `sup-${((index + copy) % 12) + 1}`;
      const expired = item.trackExpiry && index === 4 && copy === 1;
      const soon = item.trackExpiry && index === 2 && copy === 0;
      const quantity = index === 1 && copy === 1 ? 0 : index % 9 === 0 && copy === 0 ? 8 : 80 + ((index * 7 + copy * 11) % 40);
      const expiry = item.trackExpiry ? new Date(Date.UTC(2027, (index + copy * 4) % 12, 12 + (index % 15))) : null;
      if (expired && expiry) expiry.setUTCFullYear(2025, 3, 12);
      if (soon && expiry) expiry.setUTCMonth(6);
      const lines = linesBySupplier.get(supplierId) || [];
      if (quantity > 0) {
        lines.push({
          medicineId: item.id,
          batchNumber: item.trackBatches ? `GH${2026 + copy}${String(index + 1).padStart(4, "0")}` : `LOT${String(index + 1).padStart(4, "0")}${copy}`,
          quantity,
          unitCost: Math.round(item.sellingPrice * 0.56),
          expiryDate: expiry ? expiry.toISOString().slice(0, 10) : "",
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
    const item = state.medicines[(index * 7 + 3) % state.medicines.length];
    const quantity = (index % 3) + 1;
    try {
      state = completeSale(
        state,
        {
          items: [{ medicineId: item.id, quantity, unit: item.baseUnit, conversion: 1 }],
          paymentMethod: ["Cash", "Mobile Money", "Card"][index % 3],
          requestId: `seed-sale-${index + 1}`,
        },
        clock,
      ).state;
    } catch {
      // Skip items whose remaining sellable stock cannot cover the requested units.
    }
  }

  return logout(state, clock);
}

import { z } from "zod";
import {
  ITEM_TYPE_LABELS,
  ITEM_TYPES,
  REGULATORY_CLASSES,
  type Item,
  type ItemType,
  type RegulatoryClass,
} from "./types";

export { ITEM_TYPE_LABELS, ITEM_TYPES, REGULATORY_CLASSES };

export const RETAIL_CATEGORIES: Record<ItemType, string[]> = {
  medicine: ["Analgesics", "Antibiotics", "Antimalarials", "Allergy", "Cardiovascular", "Diabetes", "Gastrointestinal", "Vitamins", "General"],
  medical_supply: ["Wound care", "Diagnostics", "Injection supplies", "PPE", "First aid"],
  supplement: ["Vitamins", "Minerals", "Herbal", "Nutrition"],
  personal_care: ["Oral care", "Skin care", "Hair care", "Hygiene"],
  baby_care: ["Diapers", "Infant formula", "Baby toiletries", "Feeding"],
  general_retail: ["Household", "Beverages", "Snacks", "Convenience"],
};

export const DOSAGE_FORMS = ["Tablet", "Capsule", "Syrup", "Suspension", "Cream", "Ointment", "Injection", "Drops", "Inhaler", "Sachet"];

const sellingUnitSchema = z.object({
  name: z.string().trim().min(1, "Unit name is required."),
  conversion: z.coerce.number().int().min(1, "Conversion must be a whole number of 1 or more."),
});

export const itemFormSchema = z
  .object({
    name: z.string().trim().min(1, "Item name is required."),
    itemType: z.enum(ITEM_TYPES),
    category: z.string().trim().min(1, "Retail category is required."),
    brandName: z.string().trim(),
    manufacturer: z.string().trim(),
    barcode: z.string().trim(),
    description: z.string().trim(),
    genericName: z.string().trim(),
    strength: z.string().trim(),
    dosageForm: z.string().trim(),
    prescriptionRequired: z.boolean(),
    regulatoryClassification: z.string().trim(),
    baseUnit: z.string().trim().min(1, "Base unit is required."),
    sellingUnits: z.array(sellingUnitSchema).min(1, "Add at least one selling unit."),
    sellingPriceCedis: z.coerce.number().min(0, "Selling price cannot be negative."),
    reorderThreshold: z.coerce.number().int().min(0, "Reorder threshold cannot be negative."),
    trackBatches: z.boolean(),
    trackExpiry: z.boolean(),
    imageDataUrl: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.itemType !== "medicine") return;
    if (!value.genericName) {
      ctx.addIssue({ code: "custom", path: ["genericName"], message: "Generic name is required for medicines." });
    }
    if (!value.strength) {
      ctx.addIssue({ code: "custom", path: ["strength"], message: "Strength is required for medicines." });
    }
    if (!value.dosageForm) {
      ctx.addIssue({ code: "custom", path: ["dosageForm"], message: "Dosage form is required for medicines." });
    }
    if (!value.regulatoryClassification || value.regulatoryClassification === "Not applicable") {
      ctx.addIssue({
        code: "custom",
        path: ["regulatoryClassification"],
        message: "Choose a regulatory dispensing class for medicines.",
      });
    }
  });

export type ItemFormValues = z.infer<typeof itemFormSchema>;

export function sanitizeItemImage(value?: string): string {
  const image = (value || "").trim();
  return image.startsWith("data:image/") ? image : "";
}

export function itemTypeLabel(type: ItemType | string): string {
  return ITEM_TYPE_LABELS[type as ItemType] || type;
}

export function itemSubtitle(item: Pick<Item, "itemType" | "genericName" | "strength" | "brandName" | "category">): string {
  if (item.itemType === "medicine") {
    return [item.genericName, item.strength].filter(Boolean).join(" · ") || item.category;
  }
  return [item.brandName, item.category].filter(Boolean).join(" · ") || itemTypeLabel(item.itemType);
}

export function searchText(item: Item): string {
  return [
    item.name,
    item.genericName,
    item.brandName,
    item.barcode,
    item.category,
    item.manufacturer,
    itemTypeLabel(item.itemType),
  ]
    .join(" ")
    .toLowerCase();
}

export function defaultItemForm(item?: Item): ItemFormValues {
  const baseUnit = item?.baseUnit || "unit";
  return {
    name: item?.name || "",
    itemType: item?.itemType || "medicine",
    category: item?.category || "General",
    brandName: item?.brandName || "",
    manufacturer: item?.manufacturer || "",
    barcode: item?.barcode || "",
    description: item?.description || "",
    genericName: item?.genericName || "",
    strength: item?.strength || "",
    dosageForm: item?.dosageForm || "Tablet",
    prescriptionRequired: item?.prescriptionRequired || false,
    regulatoryClassification: (item?.regulatoryClassification as RegulatoryClass) || (item ? "Not applicable" : "OTC"),
    baseUnit,
    sellingUnits: item?.sellingUnits?.length
      ? item.sellingUnits.map((unit) => ({ ...unit }))
      : [
          { name: baseUnit, conversion: 1 },
          { name: "pack", conversion: 10 },
        ],
    sellingPriceCedis: item ? item.sellingPrice / 100 : 0,
    reorderThreshold: item?.reorderThreshold ?? 20,
    trackBatches: item?.trackBatches ?? true,
    trackExpiry: item?.trackExpiry ?? true,
    imageDataUrl: item?.imageDataUrl || "",
  };
}

export function formToItemInput(values: ItemFormValues): Partial<Item> {
  const isMedicine = values.itemType === "medicine";
  return {
    name: values.name,
    itemType: values.itemType,
    category: values.category,
    brandName: values.brandName,
    manufacturer: values.manufacturer,
    barcode: values.barcode,
    description: values.description,
    genericName: isMedicine ? values.genericName : "",
    strength: isMedicine ? values.strength : "",
    dosageForm: isMedicine ? values.dosageForm : "",
    prescriptionRequired: isMedicine ? values.prescriptionRequired : false,
    regulatoryClassification: isMedicine ? values.regulatoryClassification : "Not applicable",
    baseUnit: values.baseUnit,
    sellingUnits: values.sellingUnits,
    sellingPrice: Math.round(values.sellingPriceCedis * 100),
    reorderThreshold: values.reorderThreshold,
    trackBatches: values.trackBatches,
    trackExpiry: values.trackExpiry,
    imageDataUrl: values.imageDataUrl,
  };
}

export function normalizeItem(input: Partial<Item>, previous: Item | undefined, now: string, id: string): Item {
  const itemType = input.itemType || previous?.itemType || "medicine";
  const name = (input.name ?? previous?.name ?? "").trim();
  if (!name) throw new Error("Item name is required.");
  const baseUnit = (input.baseUnit ?? previous?.baseUnit ?? "unit").trim() || "unit";
  const sellingUnits = (input.sellingUnits ?? previous?.sellingUnits ?? [{ name: baseUnit, conversion: 1 }]).map((unit) => ({
    name: unit.name.trim(),
    conversion: Number(unit.conversion) || 1,
  }));
  if (!sellingUnits.length || sellingUnits.some((unit) => !unit.name || unit.conversion < 1)) {
    throw new Error("Each selling unit needs a name and a conversion of 1 or more.");
  }
  const isMedicine = itemType === "medicine";
  const genericName = (input.genericName ?? previous?.genericName ?? "").trim();
  const strength = (input.strength ?? previous?.strength ?? "").trim();
  const dosageForm = (input.dosageForm ?? previous?.dosageForm ?? "").trim();
  const regulatoryClassification = (input.regulatoryClassification ?? previous?.regulatoryClassification ?? (isMedicine ? "OTC" : "Not applicable")).trim();
  if (isMedicine) {
    if (!genericName) throw new Error("Generic name is required for medicines.");
    if (!strength) throw new Error("Strength is required for medicines.");
    if (!dosageForm) throw new Error("Dosage form is required for medicines.");
    if (!regulatoryClassification || regulatoryClassification === "Not applicable") {
      throw new Error("Choose a regulatory dispensing class for medicines.");
    }
  }
  return {
    id,
    name,
    itemType,
    category: (input.category ?? previous?.category ?? "General").trim() || "General",
    brandName: (input.brandName ?? previous?.brandName ?? "").trim(),
    manufacturer: (input.manufacturer ?? previous?.manufacturer ?? "").trim(),
    barcode: (input.barcode ?? previous?.barcode ?? "").trim(),
    description: (input.description ?? previous?.description ?? "").trim(),
    genericName: isMedicine ? genericName : "",
    strength: isMedicine ? strength : "",
    dosageForm: isMedicine ? dosageForm : "",
    prescriptionRequired: isMedicine ? Boolean(input.prescriptionRequired ?? previous?.prescriptionRequired) : false,
    regulatoryClassification: isMedicine ? regulatoryClassification : "Not applicable",
    baseUnit,
    sellingUnits,
    sellingPrice: Number(input.sellingPrice ?? previous?.sellingPrice) || 0,
    reorderThreshold: Number(input.reorderThreshold ?? previous?.reorderThreshold) || 0,
    trackBatches: input.trackBatches ?? previous?.trackBatches ?? true,
    trackExpiry: input.trackExpiry ?? previous?.trackExpiry ?? true,
    imageDataUrl: sanitizeItemImage(input.imageDataUrl !== undefined ? input.imageDataUrl : previous?.imageDataUrl),
    active: input.active ?? previous?.active ?? true,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
}

export function migrateItem(raw: Partial<Item> & { id: string }): Item {
  const itemType = raw.itemType && ITEM_TYPES.includes(raw.itemType) ? raw.itemType : "medicine";
  return {
    id: raw.id,
    name: raw.name || "Untitled item",
    itemType,
    category: raw.category || "General",
    brandName: raw.brandName || "",
    manufacturer: raw.manufacturer || "",
    barcode: raw.barcode || "",
    description: raw.description || "",
    genericName: raw.genericName || "",
    strength: raw.strength || "",
    dosageForm: raw.dosageForm || "",
    prescriptionRequired: Boolean(raw.prescriptionRequired),
    regulatoryClassification: raw.regulatoryClassification || (itemType === "medicine" ? "OTC" : "Not applicable"),
    baseUnit: raw.baseUnit || "unit",
    sellingUnits: raw.sellingUnits?.length ? raw.sellingUnits : [{ name: raw.baseUnit || "unit", conversion: 1 }],
    sellingPrice: Number(raw.sellingPrice) || 0,
    reorderThreshold: Number(raw.reorderThreshold) || 20,
    trackBatches: raw.trackBatches !== false,
    trackExpiry: raw.trackExpiry !== false,
    imageDataUrl: sanitizeItemImage(raw.imageDataUrl),
    active: raw.active !== false,
    createdAt: raw.createdAt || "2024-01-10T08:00:00.000Z",
    updatedAt: raw.updatedAt || raw.createdAt || "2026-04-01T08:00:00.000Z",
  };
}

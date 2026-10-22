import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import {
  defaultItemForm,
  DOSAGE_FORMS,
  formToItemInput,
  itemFormSchema,
  RETAIL_CATEGORIES,
  type ItemFormValues,
} from "../lib/pharmacy/item-catalog";
import { ITEM_TYPE_LABELS, ITEM_TYPES, REGULATORY_CLASSES, type Item } from "../lib/pharmacy/types";
import { repository } from "../lib/repository";
import { Button, Drawer, Field } from "./app-ui";
import { ItemImageField } from "./item-image-field";

export function ItemDrawer({
  item,
  onClose,
}: {
  item?: Item | null;
  onClose: () => void;
}) {
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: defaultItemForm(item || undefined),
    mode: "onSubmit",
  });
  const units = useFieldArray({ control: form.control, name: "sellingUnits" });
  const itemType = form.watch("itemType");
  const baseUnit = form.watch("baseUnit");
  const categories = RETAIL_CATEGORIES[itemType] || RETAIL_CATEGORIES.general_retail;
  const isMedicine = itemType === "medicine";

  useEffect(() => {
    form.reset(defaultItemForm(item || undefined));
  }, [item]);

  useEffect(() => {
    const current = form.getValues("category");
    if (!categories.includes(current)) {
      form.setValue("category", categories[0]);
    }
    if (!isMedicine) {
      form.setValue("regulatoryClassification", "Not applicable");
      form.setValue("prescriptionRequired", false);
    } else if (form.getValues("regulatoryClassification") === "Not applicable") {
      form.setValue("regulatoryClassification", "OTC");
    }
  }, [categories, form, isMedicine]);

  useEffect(() => {
    const first = form.getValues("sellingUnits.0");
    if (first && first.conversion === 1 && first.name !== baseUnit && baseUnit) {
      form.setValue("sellingUnits.0.name", baseUnit);
    }
  }, [baseUnit, form]);

  const submit = form.handleSubmit((values) => {
    const payload = formToItemInput(values);
    if (item) repository.updateMedicine(item.id, payload);
    else repository.addMedicine(payload);
    onClose();
  });

  return (
    <Drawer
      title={item ? "Edit item" : "Add item"}
      subtitle="Catalog details only. Delivery quantities and batch expiry are recorded in Stock In."
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" onClick={submit} testid="button-save-item">
            {item ? "Save changes" : "Create item"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="item-form">
        <section className="form-section">
          <h3>Basic information</h3>
          <p>Shared identity for any product sold or dispensed from the pharmacy.</p>
          <div className="form-grid">
            <Field label="Item name" error={form.formState.errors.name?.message}>
              <input className="input" data-testid="input-name" {...form.register("name")} />
            </Field>
            <Field label="Item type" error={form.formState.errors.itemType?.message}>
              <select className="select" data-testid="select-item-type" {...form.register("itemType")}>
                {ITEM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ITEM_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Retail category" error={form.formState.errors.category?.message} hint="Separate from regulatory dispensing class.">
              <select className="select" {...form.register("category")}>
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </Field>
            <Field label="Brand name" error={form.formState.errors.brandName?.message}>
              <input className="input" {...form.register("brandName")} />
            </Field>
            <Field label="Manufacturer" error={form.formState.errors.manufacturer?.message}>
              <input className="input" {...form.register("manufacturer")} />
            </Field>
            <Field label="Barcode" error={form.formState.errors.barcode?.message}>
              <input className="input" {...form.register("barcode")} />
            </Field>
          </div>
          <Field label="Description" error={form.formState.errors.description?.message}>
            <textarea className="textarea" {...form.register("description")} />
          </Field>
          <ItemImageField value={form.watch("imageDataUrl")} onChange={(value) => form.setValue("imageDataUrl", value, { shouldDirty: true })} />
        </section>

        <section className="form-section">
          <h3>Type-specific details</h3>
          {isMedicine ? (
            <>
              <p>Required only for medicines. Regulatory class is independent of retail category.</p>
              <div className="form-grid">
                <Field label="Generic name" error={form.formState.errors.genericName?.message}>
                  <input className="input" data-testid="input-genericName" {...form.register("genericName")} />
                </Field>
                <Field label="Strength" error={form.formState.errors.strength?.message}>
                  <input className="input" data-testid="input-strength" {...form.register("strength")} />
                </Field>
                <Field label="Dosage form" error={form.formState.errors.dosageForm?.message}>
                  <select className="select" {...form.register("dosageForm")}>
                    {DOSAGE_FORMS.map((formName) => (
                      <option key={formName}>{formName}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Regulatory classification" error={form.formState.errors.regulatoryClassification?.message}>
                  <select className="select" {...form.register("regulatoryClassification")}>
                    {REGULATORY_CLASSES.filter((value) => value !== "Not applicable").map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <label className="check-row">
                <input type="checkbox" {...form.register("prescriptionRequired")} />
                Prescription required
              </label>
            </>
          ) : (
            <p className="small-muted">No medicine-specific fields apply to {ITEM_TYPE_LABELS[itemType].toLowerCase()} items.</p>
          )}
        </section>

        <section className="form-section">
          <h3>Pricing and units</h3>
          <p>Selling price is the default counter price for one base unit.</p>
          <div className="form-grid">
            <Field label="Base unit" error={form.formState.errors.baseUnit?.message}>
              <input className="input" {...form.register("baseUnit")} placeholder="tablet, bottle, pack…" />
            </Field>
            <Field label="Selling price (GH₵)" error={form.formState.errors.sellingPriceCedis?.message}>
              <input className="input" type="number" min="0" step="0.01" data-testid="input-sellingPrice" {...form.register("sellingPriceCedis")} />
            </Field>
          </div>
          <div className="unit-rows">
            {units.fields.map((field, index) => (
              <div className="unit-row" key={field.id}>
                <Field label={index === 0 ? "Selling unit" : ""} error={form.formState.errors.sellingUnits?.[index]?.name?.message}>
                  <input className="input" {...form.register(`sellingUnits.${index}.name`)} />
                </Field>
                <Field label={index === 0 ? "Base units per sale unit" : ""} error={form.formState.errors.sellingUnits?.[index]?.conversion?.message}>
                  <input className="input" type="number" min="1" step="1" {...form.register(`sellingUnits.${index}.conversion`)} />
                </Field>
                <button
                  type="button"
                  className="btn btn-icon btn-sm"
                  disabled={units.fields.length === 1}
                  onClick={() => units.remove(index)}
                  aria-label="Remove unit"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          {form.formState.errors.sellingUnits?.root?.message && (
            <div className="field-error">{form.formState.errors.sellingUnits.root.message}</div>
          )}
          <Button className="btn-sm" onClick={() => units.append({ name: "", conversion: 1 })}>
            <Plus size={13} /> Add selling unit
          </Button>
        </section>

        <section className="form-section">
          <h3>Inventory settings</h3>
          <p>These control alerts and whether Stock In asks for lot and expiry details. They do not create stock.</p>
          <Field label="Reorder threshold" error={form.formState.errors.reorderThreshold?.message}>
            <input className="input" type="number" min="0" step="1" {...form.register("reorderThreshold")} />
          </Field>
          <label className="check-row">
            <input type="checkbox" {...form.register("trackBatches")} />
            Track batch or lot numbers
          </label>
          <label className="check-row">
            <input type="checkbox" {...form.register("trackExpiry")} />
            Track expiry dates
          </label>
        </section>
      </form>
    </Drawer>
  );
}

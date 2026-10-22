import type { Batch, DerivedAlert, Medicine, Sale, State } from "./types";

export function startOfDay(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isExpired(batch: Batch, now = new Date()): boolean {
  return new Date(`${batch.expiryDate}T00:00:00`) < startOfDay(now);
}

export function isSellable(batch: Batch, now = new Date()): boolean {
  return batch.status === "active" && batch.quantityRemaining > 0 && !isExpired(batch, now);
}

export function availableStock(medicineId: string, state: State, now = new Date()): number {
  return state.batches
    .filter((batch) => batch.medicineId === medicineId && isSellable(batch, now))
    .reduce((sum, batch) => sum + batch.quantityRemaining, 0);
}

export function stockStatus(medicine: Medicine, state: State, now = new Date()): "In stock" | "Low stock" | "Out of stock" {
  const quantity = availableStock(medicine.id, state, now);
  if (quantity === 0) return "Out of stock";
  if (quantity <= medicine.reorderThreshold) return "Low stock";
  return "In stock";
}

export function saleCost(sale: Sale, batches: Batch[]): number {
  return sale.items.reduce((total, item) => {
    return (
      total +
      item.allocations.reduce((sum, allocation) => {
        const batch = batches.find((candidate) => candidate.id === allocation.batchId);
        return sum + (batch?.purchaseCost || 0) * allocation.quantity;
      }, 0)
    );
  }, 0);
}

export function inventoryValue(state: State, now = new Date()): number {
  return state.batches
    .filter((batch) => batch.quantityRemaining > 0 && !isExpired(batch, now))
    .reduce((sum, batch) => sum + batch.quantityRemaining * batch.purchaseCost, 0);
}

export function salesInRange(state: State, from: string, to: string): Sale[] {
  return state.sales.filter((sale) => {
    const day = sale.createdAt.slice(0, 10);
    return day >= from && day <= to;
  });
}

export function reportForRange(state: State, from: string, to: string) {
  const sales = salesInRange(state, from, to);
  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const cost = sales.reduce((sum, sale) => sum + saleCost(sale, state.batches), 0);
  const days = Array.from(new Set(sales.map((sale) => sale.createdAt.slice(0, 10)))).sort();
  return {
    sales,
    transactionCount: sales.length,
    revenue,
    cost,
    margin: revenue - cost,
    inventoryValuation: inventoryValue(state),
    daily: days.map((day) => {
      const rows = sales.filter((sale) => sale.createdAt.startsWith(day));
      return {
        day,
        receipts: rows.length,
        revenue: rows.reduce((sum, sale) => sum + sale.total, 0),
      };
    }),
  };
}

export function dashboardMetrics(state: State, rangeDays: number, now = new Date()) {
  const dayStart = startOfDay(now);
  const todaySales = state.sales.filter((sale) => new Date(sale.createdAt) >= dayStart);
  const low = state.medicines.filter((medicine) => medicine.active && stockStatus(medicine, state, now) === "Low stock");
  const out = state.medicines.filter((medicine) => medicine.active && stockStatus(medicine, state, now) === "Out of stock");
  const warningMs = state.settings.expiryWarningDays * 86400000;
  const soon = state.batches.filter(
    (batch) =>
      batch.quantityRemaining > 0 &&
      !isExpired(batch, now) &&
      new Date(`${batch.expiryDate}T00:00:00`).getTime() <= dayStart.getTime() + warningMs,
  );
  const expired = state.batches.filter((batch) => batch.quantityRemaining > 0 && isExpired(batch, now));
  const chartStart = new Date(dayStart);
  chartStart.setDate(chartStart.getDate() - (rangeDays - 1));
  const series = Array.from({ length: rangeDays }, (_, index) => {
    const date = new Date(chartStart);
    date.setDate(chartStart.getDate() + index);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const matches = state.sales.filter((sale) => {
      const created = new Date(sale.createdAt);
      return `${created.getFullYear()}-${created.getMonth()}-${created.getDate()}` === key;
    });
    return {
      date,
      total: matches.reduce((sum, sale) => sum + sale.total, 0),
      count: matches.length,
    };
  });
  return {
    todaySales,
    todayTotal: todaySales.reduce((sum, sale) => sum + sale.total, 0),
    inventoryValue: inventoryValue(state, now),
    low,
    out,
    lowCount: low.length + out.length,
    soon,
    expired,
    stockCounts: {
      healthy: state.medicines.filter((medicine) => medicine.active && stockStatus(medicine, state, now) === "In stock").length,
      low: low.length,
      out: out.length,
      expiring: soon.length,
      expired: expired.length,
    },
    series,
  };
}

export function deriveAlerts(state: State, now = new Date()): DerivedAlert[] {
  const alerts: DerivedAlert[] = [];
  for (const medicine of state.medicines.filter((item) => item.active)) {
    const quantity = availableStock(medicine.id, state, now);
    if (quantity === 0) {
      alerts.push({
        id: `out-${medicine.id}`,
        severity: "high",
        title: "Out of stock",
        description: `${medicine.name} has no available, unexpired stock.`,
        link: `/medicines/${medicine.id}`,
      });
    } else if (quantity <= medicine.reorderThreshold) {
      alerts.push({
        id: `low-${medicine.id}`,
        severity: "medium",
        title: "Low stock",
        description: `${medicine.name} is at ${quantity} units, below its reorder point of ${medicine.reorderThreshold}.`,
        link: `/medicines/${medicine.id}`,
      });
    }
  }
  const warningMs = state.settings.expiryWarningDays * 86400000;
  const today = startOfDay(now);
  for (const batch of state.batches.filter((item) => item.quantityRemaining > 0)) {
    const medicine = state.medicines.find((item) => item.id === batch.medicineId);
    const expiry = new Date(`${batch.expiryDate}T00:00:00`);
    if (isExpired(batch, now)) {
      alerts.push({
        id: `exp-${batch.id}`,
        severity: "high",
        title: "Expired stock",
        description: `${medicine?.name} · batch ${batch.batchNumber} · expiry ${batch.expiryDate}.`,
        link: `/inventory/batches/${batch.id}`,
      });
    } else if (expiry.getTime() <= today.getTime() + warningMs) {
      alerts.push({
        id: `soon-${batch.id}`,
        severity: "medium",
        title: "Expiry approaching",
        description: `${medicine?.name} · batch ${batch.batchNumber} · expiry ${batch.expiryDate}.`,
        link: `/inventory/batches/${batch.id}`,
      });
    }
  }
  alerts.push({
    id: "info-backup-reminder",
    severity: "info",
    title: "Demo data backup reminder",
    description:
      "This local demo has no production recovery. Export a JSON backup from Settings before resetting or clearing browser data.",
    informational: true,
    link: "/settings",
  });
  return alerts.filter((alert) => !alert.informational || !state.alertsAcknowledged.includes(alert.id));
}

export function formatMoney(cents: number, currency = "GH₵"): string {
  return `${currency} ${(cents / 100).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

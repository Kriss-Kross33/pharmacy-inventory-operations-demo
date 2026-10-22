import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  Archive,
  ArrowDownUp,
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  Pencil,
  Plus,
  Trash2,
  Truck,
} from "lucide-react";
import { ItemDrawer } from "../components/item-drawer";
import { ItemPhoto } from "../components/item-image-field";
import { Badge, Button, Empty, Field, Modal, PageTitle, SearchBox, money } from "../components/app-ui";
import { itemSubtitle, itemTypeLabel, searchText } from "../lib/pharmacy/item-catalog";
import { ITEM_TYPE_LABELS, ITEM_TYPES, type Item, type Movement, type Stocktake, type Supplier } from "../lib/pharmacy/types";
import { can, repository, roleFor, stockFor, stockStatus, useRepository } from "../lib/repository";

const TABS = [
  { id: "items", label: "All Items" },
  { id: "stock-in", label: "Stock In" },
  { id: "stocktaking", label: "Stocktaking" },
  { id: "suppliers", label: "Suppliers" },
  { id: "history", label: "History" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function useInventorySearch() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const tab = (TABS.some((entry) => entry.id === params.get("tab")) ? params.get("tab") : "items") as TabId;
  const openNew = params.get("new") === "1";
  const setTab = (next: TabId) => {
    setLocation(next === "items" ? "/inventory" : `/inventory?tab=${next}`);
  };
  const clearNew = () => {
    setLocation(tab === "items" ? "/inventory" : `/inventory?tab=${tab}`);
  };
  return { tab, setTab, openNew, clearNew };
}

export function InventoryWorkspace() {
  const state = useRepository();
  const role = roleFor(state);
  const { tab, setTab, openNew, clearNew } = useInventorySearch();
  const [editing, setEditing] = useState<Item | null | undefined>(undefined);

  useEffect(() => {
    if (openNew && role === "Administrator") {
      setEditing(null);
      clearNew();
    }
  }, [openNew, role, clearNew]);

  return (
    <>
      <PageTitle
        title="Inventory"
        sub="One catalog and stock ledger for medicines and retail products."
        action={
          role === "Administrator" && tab === "items" ? (
            <Button variant="primary" onClick={() => setEditing(null)} testid="button-add-item">
              <Plus size={15} /> Add item
            </Button>
          ) : null
        }
      />
      <div className="inv-tabs" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`inv-tab ${tab === entry.id ? "active" : ""}`}
            data-testid={`tab-${entry.id}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {tab === "items" && <AllItemsTab onEdit={(item) => setEditing(item)} />}
      {tab === "stock-in" && <StockInTab />}
      {tab === "stocktaking" && <StocktakingTab />}
      {tab === "suppliers" && <SuppliersTab />}
      {tab === "history" && <HistoryTab />}
      {editing !== undefined && <ItemDrawer item={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}

function AllItemsTab({ onEdit }: { onEdit: (item: Item) => void }) {
  const state = useRepository();
  const role = roleFor(state);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All types");
  const [status, setStatus] = useState("All status");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Item | null>(null);
  const rows = useMemo(
    () =>
      state.medicines
        .filter((item) => item.active)
        .filter((item) => !query || searchText(item).includes(query.toLowerCase()))
        .filter((item) => type === "All types" || item.itemType === type)
        .filter((item) => status === "All status" || stockStatus(item, state) === status)
        .sort((left, right) =>
          sort === "stock"
            ? stockFor(left.id, state) - stockFor(right.id, state)
            : sort === "price"
              ? left.sellingPrice - right.sellingPrice
              : left.name.localeCompare(right.name),
        ),
    [state, query, type, status, sort],
  );
  const perPage = 12;
  const visible = rows.slice(page * perPage, (page + 1) * perPage);
  const counts = {
    catalog: state.medicines.filter((item) => item.active).length,
    inStock: state.medicines.filter((item) => item.active && stockStatus(item, state) === "In stock").length,
    low: state.medicines.filter((item) => item.active && stockStatus(item, state) === "Low stock").length,
    out: state.medicines.filter((item) => item.active && stockStatus(item, state) === "Out of stock").length,
  };

  return (
    <>
      <div className="stat-grid">
        {[
          ["Catalog items", counts.catalog],
          ["In stock", counts.inStock],
          ["Low stock", counts.low],
          ["Out of stock", counts.out],
        ].map(([label, value]) => (
          <div className="card stat-card" key={String(label)}>
            <div className="stat-top">
              {label}
              <Boxes size={15} />
            </div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>
      <section className="card">
        <div className="toolbar">
          <SearchBox value={query} onChange={(value) => { setQuery(value); setPage(0); }} placeholder="Search name, brand, barcode…" />
          <select className="select" style={{ width: 170 }} value={type} onChange={(event) => { setType(event.target.value); setPage(0); }} data-testid="filter-item-type">
            <option value="All types">All types</option>
            {ITEM_TYPES.map((value) => (
              <option key={value} value={value}>
                {ITEM_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
          <select className="select" style={{ width: 150 }} value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }} data-testid="filter-stock-status">
            {["All status", "In stock", "Low stock", "Out of stock"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select className="select" style={{ width: 150 }} value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="name">Name A–Z</option>
            <option value="stock">Stock: low first</option>
            <option value="price">Price: low first</option>
          </select>
          <span className="small-muted">{rows.length} items</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Type</th>
                <th>Category</th>
                <th>On hand</th>
                <th>Selling price</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const quantity = stockFor(item.id, state);
                const health = stockStatus(item, state);
                return (
                  <tr key={item.id} data-testid={`row-item-${item.id}`}>
                    <td>
                      <div className="item-cell">
                        <ItemPhoto src={item.imageDataUrl} name={item.name} />
                        <div>
                          <Link className="med-name" href={`/inventory/items/${item.id}`} style={{ textDecoration: "none" }}>
                            {item.name}
                          </Link>
                          <div className="small-muted">{itemSubtitle(item)}</div>
                        </div>
                      </div>
                    </td>
                    <td>{itemTypeLabel(item.itemType)}</td>
                    <td>{item.category}</td>
                    <td>
                      <strong>{quantity}</strong> <span className="small-muted">{item.baseUnit}s</span>
                    </td>
                    <td>{money(item.sellingPrice)}</td>
                    <td>
                      <Badge tone={health === "In stock" ? "green" : health === "Low stock" ? "amber" : "red"}>{health}</Badge>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 5 }}>
                        {role === "Administrator" ? (
                          <>
                            <Button className="btn-icon btn-sm" onClick={() => onEdit(item)} aria-label="Edit">
                              <Pencil size={13} />
                            </Button>
                            <Button className="btn-icon btn-sm" onClick={() => setSelected(item)} aria-label="Archive">
                              <Archive size={13} />
                            </Button>
                          </>
                        ) : (
                          <Link className="btn btn-sm" href={`/inventory/items/${item.id}`}>
                            <Eye size={13} /> Details
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visible.length && <Empty title="No items found" detail="Try a different search or filter." />}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
          <span className="small-muted">
            Showing {rows.length ? page * perPage + 1 : 0}–{Math.min((page + 1) * perPage, rows.length)} of {rows.length}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <Button className="btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={14} /> Previous
            </Button>
            <Button className="btn-sm" disabled={(page + 1) * perPage >= rows.length} onClick={() => setPage(page + 1)}>
              Next <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </section>
      {selected && (
        <Modal
          title="Archive item"
          onClose={() => setSelected(null)}
          footer={<Button onClick={() => setSelected(null)}>Close</Button>}
        >
          <p>
            <strong>{selected.name}</strong>
            <br />
            <span className="small-muted">{itemSubtitle(selected)}</span>
          </p>
          {can(role, "admin") && (
            <Button
              variant="danger"
              onClick={() => {
                repository.archiveMedicine(selected.id);
                setSelected(null);
              }}
            >
              <Archive size={14} /> Archive item
            </Button>
          )}
        </Modal>
      )}
    </>
  );
}

type StockLine = {
  key: string;
  medicineId: string;
  quantity: number;
  unit: string;
  conversion: number;
  unitCostCedis: number;
  batchNumber: string;
  expiryDate: string;
};

function emptyLine(item?: Item): StockLine {
  const unit = item?.sellingUnits[0] || { name: item?.baseUnit || "", conversion: 1 };
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    medicineId: item?.id || "",
    quantity: 1,
    unit: unit.name,
    conversion: unit.conversion,
    unitCostCedis: item ? item.sellingPrice / 100 : 0,
    batchNumber: "",
    expiryDate: "",
  };
}

function StockInTab() {
  const state = useRepository();
  const role = roleFor(state);
  const admin = role === "Administrator";
  const [supplierId, setSupplierId] = useState(state.suppliers.find((supplier) => supplier.active)?.id || "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<StockLine[]>([emptyLine()]);
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [posted, setPosted] = useState<string | null>(null);
  const receipts = state.purchases.filter((purchase) => purchase.status === "Received").slice(0, 8);

  const setLine = (key: string, patch: Partial<StockLine>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };
  const selectItem = (key: string, medicineId: string) => {
    const item = state.medicines.find((candidate) => candidate.id === medicineId);
    setLine(key, emptyLine(item));
  };
  const total = lines.reduce((sum, line) => sum + line.quantity * Math.round(line.unitCostCedis * 100), 0);

  const post = () => {
    if (posting) return;
    try {
      setError("");
      setPosting(true);
      const id = requestId || `stockin-${Date.now()}`;
      setRequestId(id);
      const purchase = repository.receiveStockIn({
        supplierId,
        invoiceNumber,
        purchaseDate,
        notes,
        requestId: id,
        items: lines.map((line) => ({
          medicineId: line.medicineId,
          quantity: Number(line.quantity),
          unit: line.unit,
          conversion: line.conversion,
          unitCost: Math.round(line.unitCostCedis * 100),
          batchNumber: line.batchNumber,
          expiryDate: line.expiryDate,
        })),
      });
      setPosted(purchase.reference);
      setLines([emptyLine()]);
      setInvoiceNumber("");
      setNotes("");
      setRequestId("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="inv-split">
      <section className="card">
        <div className="card-title">Receive delivery</div>
        <div className="card-subtitle">Posting updates batches, valuation, movements, alerts and the audit trail in one step.</div>
        {!admin && <div className="notice" style={{ marginTop: 14 }}>Only an Administrator can post stock in.</div>}
        <div className="form-grid" style={{ marginTop: 16 }}>
          <Field label="Supplier">
            <select className="select" value={supplierId} disabled={!admin} onChange={(event) => setSupplierId(event.target.value)} data-testid="select-stockin-supplier">
              {state.suppliers.filter((supplier) => supplier.active).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Invoice reference">
            <input className="input" value={invoiceNumber} disabled={!admin} onChange={(event) => setInvoiceNumber(event.target.value)} data-testid="input-stockin-invoice" />
          </Field>
          <Field label="Receipt date">
            <input className="input" type="date" value={purchaseDate} disabled={!admin} onChange={(event) => setPurchaseDate(event.target.value)} />
          </Field>
          <Field label="Notes">
            <input className="input" value={notes} disabled={!admin} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Cost / unit</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const item = state.medicines.find((candidate) => candidate.id === line.medicineId);
                return (
                  <tr key={line.key}>
                    <td>
                      <select className="select" value={line.medicineId} disabled={!admin} onChange={(event) => selectItem(line.key, event.target.value)}>
                        <option value="">Select item</option>
                        {state.medicines.filter((candidate) => candidate.active).map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="input" type="number" min="1" step="1" value={line.quantity} disabled={!admin} style={{ width: 72 }} onChange={(event) => setLine(line.key, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} />
                    </td>
                    <td>
                      <select
                        className="select"
                        value={line.unit}
                        disabled={!admin || !item}
                        onChange={(event) => {
                          const unit = item?.sellingUnits.find((entry) => entry.name === event.target.value);
                          if (unit) setLine(line.key, { unit: unit.name, conversion: unit.conversion });
                        }}
                      >
                        {(item?.sellingUnits || [{ name: line.unit, conversion: line.conversion }]).map((unit) => (
                          <option key={unit.name} value={unit.name}>
                            {unit.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="input" type="number" min="0" step="0.01" value={line.unitCostCedis} disabled={!admin} style={{ width: 90 }} onChange={(event) => setLine(line.key, { unitCostCedis: Number(event.target.value) })} />
                    </td>
                    <td>
                      {item && !item.trackBatches ? (
                        <span className="small-muted">Not tracked</span>
                      ) : (
                        <input className="input" value={line.batchNumber} disabled={!admin} style={{ width: 110 }} onChange={(event) => setLine(line.key, { batchNumber: event.target.value })} />
                      )}
                    </td>
                    <td>
                      {item && !item.trackExpiry ? (
                        <span className="small-muted">Not tracked</span>
                      ) : (
                        <input className="input" type="date" value={line.expiryDate} disabled={!admin} style={{ width: 130 }} onChange={(event) => setLine(line.key, { expiryDate: event.target.value })} />
                      )}
                    </td>
                    <td>
                      <button className="btn btn-icon btn-sm" disabled={!admin || lines.length === 1} onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))} aria-label="Remove line">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 10, flexWrap: "wrap" }}>
          <Button className="btn-sm" disabled={!admin} onClick={() => setLines((current) => [...current, emptyLine()])}>
            <Plus size={13} /> Add item line
          </Button>
          <strong>Delivery total {money(total)}</strong>
        </div>
        {error && <div className="notice" style={{ marginTop: 12, background: "#fff0ef", color: "#973f3a", borderColor: "#f0d4d1" }}>{error}</div>}
        {posted && <div className="notice" style={{ marginTop: 12, background: "#e9f5ee", color: "#28664f", borderColor: "#cfe6d8" }}>Posted {posted}. Stock, movements and audit are updated.</div>}
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <Button variant="primary" disabled={!admin || posting} onClick={post} testid="button-post-stockin">
            <Check size={14} /> {posting ? "Posting…" : "Confirm stock in"}
          </Button>
        </div>
      </section>
      <section className="card">
        <div className="card-title">Recent receipts</div>
        <div className="card-subtitle">Same purchase records used by accounting and reports.</div>
        {receipts.map((purchase) => (
          <div key={purchase.id} style={{ padding: "12px 0", borderBottom: "1px solid #edf1ef" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 12 }}>{purchase.reference}</strong>
              <Badge tone="green">Received</Badge>
            </div>
            <div className="small-muted">
              {state.suppliers.find((supplier) => supplier.id === purchase.supplierId)?.name} · {purchase.invoiceNumber || "No invoice"} · {purchase.purchaseDate}
            </div>
            <div className="small-muted">{purchase.items.length} lines · {money(purchase.total)}</div>
          </div>
        ))}
        {!receipts.length && <Empty title="No receipts yet" detail="Confirmed deliveries appear here." icon={Truck} />}
      </section>
    </div>
  );
}

function StocktakingTab() {
  const state = useRepository();
  const role = roleFor(state);
  const admin = role === "Administrator";
  const [currentId, setCurrentId] = useState<string | null>(state.stocktakes.find((take) => take.status === "Counting")?.id || null);
  const current = state.stocktakes.find((take) => take.id === currentId) || null;
  const [error, setError] = useState("");
  const start = () => {
    try {
      const take = repository.startStocktake();
      setCurrentId(take.id);
      setError("");
    } catch (err: any) {
      setError(err.message);
    }
  };
  const update = (batchId: string, counted: number, reason?: string) => {
    if (!current) return;
    try {
      repository.updateStocktakeCount(current.id, batchId, counted, reason);
      setError("");
    } catch (err: any) {
      setError(err.message);
    }
  };
  const approve = () => {
    if (!current) return;
    try {
      repository.approveStocktake(current.id);
      setError("");
    } catch (err: any) {
      setError(err.message);
    }
  };
  const variances = current?.lines.filter((line) => line.variance !== 0).length || 0;

  return (
    <div className="inv-split">
      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div className="card-title">Physical count</div>
            <div className="card-subtitle">Counts stay in session until an Administrator approves the variances.</div>
          </div>
          {admin && (
            <Button variant="primary" onClick={start}>
              <Plus size={14} /> Start count
            </Button>
          )}
        </div>
        {!admin && <div className="notice" style={{ marginTop: 14 }}>Administrator approval is required before counted quantities change recorded stock.</div>}
        {current ? (
          <>
            <div className="toolbar" style={{ marginTop: 16 }}>
              <Badge tone={current.status === "Approved" ? "green" : "amber"}>{current.status}</Badge>
              <span className="small-muted">{current.lines.length} batch lines · {variances} variances</span>
            </div>
            <div className="table-wrap" style={{ maxHeight: 480 }}>
              <table>
                <thead>
                  <tr>
                    <th>Item / batch</th>
                    <th>Expected</th>
                    <th>Counted</th>
                    <th>Variance</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {current.lines.map((line) => {
                    const item = state.medicines.find((candidate) => candidate.id === line.medicineId);
                    return (
                      <tr key={line.batchId}>
                        <td>
                          {item?.name}
                          <div className="small-muted">{item?.trackBatches === false ? "Untracked lot" : line.batchNumber}</div>
                        </td>
                        <td>{line.expected}</td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="1"
                            disabled={!admin || current.status !== "Counting"}
                            value={line.counted}
                            style={{ width: 78, padding: "5px" }}
                            onChange={(event) => update(line.batchId, Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                          />
                        </td>
                        <td style={{ color: line.variance < 0 ? "#a74640" : "#33795e", fontWeight: 700 }}>
                          {line.variance > 0 ? "+" : ""}
                          {line.variance}
                        </td>
                        <td>
                          <input
                            className="input"
                            disabled={!admin || current.status !== "Counting"}
                            value={line.reason}
                            placeholder={line.variance ? "Required" : "Optional"}
                            onChange={(event) => update(line.batchId, line.counted, event.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {error && <div className="notice" style={{ marginTop: 12, background: "#fff0ef", color: "#973f3a" }}>{error}</div>}
            {admin && current.status === "Counting" && (
              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <Button variant="primary" onClick={approve} testid="button-approve-stocktake">
                  <Check size={14} /> Approve and apply
                </Button>
              </div>
            )}
          </>
        ) : (
          <Empty title="No count selected" detail="Start a session or open a previous count from the history list." icon={ClipboardList} />
        )}
      </section>
      <section className="card">
        <div className="card-title">Count sessions</div>
        <div className="card-subtitle">Historical sessions remain after approval.</div>
        {state.stocktakes.map((take: Stocktake) => (
          <button
            key={take.id}
            type="button"
            className={`session-row ${currentId === take.id ? "active" : ""}`}
            onClick={() => setCurrentId(take.id)}
          >
            <div>
              <strong>{new Date(take.startedAt).toLocaleString("en-GH")}</strong>
              <div className="small-muted">{take.lines.filter((line) => line.variance).length} discrepancies · {take.lines.length} lines</div>
            </div>
            <Badge tone={take.status === "Approved" ? "green" : "amber"}>{take.status}</Badge>
          </button>
        ))}
        {!state.stocktakes.length && <Empty title="No stocktake sessions" detail="Start a count when you are ready to reconcile shelves." icon={ClipboardList} />}
      </section>
    </div>
  );
}

function SuppliersTab() {
  const state = useRepository();
  const role = roleFor(state);
  const admin = role === "Administrator";
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", contactPerson: "", phone: "", email: "", address: "", notes: "", active: true });
  const rows = state.suppliers.filter((supplier) => `${supplier.name} ${supplier.contactPerson}`.toLowerCase().includes(query.toLowerCase()));
  const open = (supplier?: Supplier) => {
    setEditing(supplier || null);
    setForm(supplier ? { ...supplier } : { name: "", contactPerson: "", phone: "", email: "", address: "", notes: "", active: true });
    setDialog(true);
  };
  return (
    <section className="card">
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Find a supplier…" />
        <Badge>{rows.length} suppliers</Badge>
        {admin && (
          <Button variant="primary" onClick={() => open()}>
            <Plus size={14} /> Add supplier
          </Button>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Contact</th>
              <th>Phone</th>
              <th>Batches</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((supplier) => (
              <tr key={supplier.id}>
                <td>
                  <Link href={`/suppliers/${supplier.id}`} className="med-name">
                    {supplier.name}
                  </Link>
                  <div className="small-muted">{supplier.address}</div>
                </td>
                <td>{supplier.contactPerson}</td>
                <td>{supplier.phone}</td>
                <td>{state.batches.filter((batch) => batch.supplierId === supplier.id).length}</td>
                <td>
                  <Badge tone={supplier.active ? "green" : "gray"}>{supplier.active ? "Active" : "Archived"}</Badge>
                </td>
                <td>
                  {admin && (
                    <Button className="btn-icon btn-sm" onClick={() => open(supplier)} aria-label="Edit supplier">
                      <Pencil size={13} />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <Empty title="No suppliers found" detail="Try another search term." icon={Truck} />}
      {dialog && (
        <Modal
          title={editing ? "Edit supplier" : "Add supplier"}
          onClose={() => setDialog(false)}
          footer={
            <>
              <Button onClick={() => setDialog(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (!form.name.trim()) return alert("Supplier name is required.");
                  if (editing) repository.updateSupplier(editing.id, form);
                  else repository.createSupplier({ ...form, active: form.active !== false });
                  setDialog(false);
                }}
              >
                Save supplier
              </Button>
            </>
          }
        >
          <div className="form-grid">
            {[["Name", "name"], ["Contact person", "contactPerson"], ["Phone", "phone"], ["Email", "email"], ["Address", "address"], ["Notes", "notes"]].map(([label, key]) => (
              <Field label={label} key={key}>
                <input className="input" value={(form as any)[key] || ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
              </Field>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}

function HistoryTab() {
  const state = useRepository();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All types");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [selected, setSelected] = useState<Movement | null>(null);
  const types = Array.from(new Set(state.movements.map((movement) => movement.type)));
  const rows = state.movements
    .filter((movement) => type === "All types" || movement.type === type)
    .filter((movement) => {
      if (!query) return true;
      const item = state.medicines.find((candidate) => candidate.id === movement.medicineId);
      return `${movement.reference} ${item?.name} ${movement.reason} ${movement.batchId}`.toLowerCase().includes(query.toLowerCase());
    })
    .slice()
    .sort((left, right) => (sort === "desc" ? right.timestamp.localeCompare(left.timestamp) : left.timestamp.localeCompare(right.timestamp)));
  const relatedAudit = selected
    ? state.audit.find((event) => event.entityId === selected.reference || event.description.includes(selected.reference) || event.entityId === selected.batchId)
    : null;

  return (
    <section className="card">
      <div className="card-title">Stock movement history</div>
      <div className="card-subtitle">Append-only ledger of receipts, sales, adjustments and approved counts.</div>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Search reference, item or reason…" />
        <select className="select" style={{ width: 180 }} value={type} onChange={(event) => setType(event.target.value)}>
          {["All types", ...types].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select className="select" style={{ width: 140 }} value={sort} onChange={(event) => setSort(event.target.value as "desc" | "asc")}>
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
        <Badge>{rows.length} records</Badge>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Item / batch</th>
              <th>Movement</th>
              <th>Change</th>
              <th>Previous → new</th>
              <th>Reason</th>
              <th>Reference</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((movement) => {
              const item = state.medicines.find((candidate) => candidate.id === movement.medicineId);
              const batch = state.batches.find((candidate) => candidate.id === movement.batchId);
              return (
                <tr key={movement.id}>
                  <td>{new Date(movement.timestamp).toLocaleString("en-GH")}</td>
                  <td>
                    <Link href={`/inventory/items/${movement.medicineId}`} className="med-name">
                      {item?.name}
                    </Link>
                    <div className="small-muted">{batch?.batchNumber}</div>
                  </td>
                  <td>{movement.type}</td>
                  <td style={{ color: movement.quantityChange < 0 ? "#a74640" : "#33795e", fontWeight: 700 }}>
                    {movement.quantityChange > 0 ? "+" : ""}
                    {movement.quantityChange}
                  </td>
                  <td>
                    {movement.previousQuantity} → {movement.newQuantity}
                  </td>
                  <td>{movement.reason}</td>
                  <td>{movement.reference}</td>
                  <td>
                    <Button className="btn-sm" onClick={() => setSelected(movement)}>
                      <Eye size={12} /> Details
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && <Empty title="No movements" detail="Receipts, sales and adjustments appear here." icon={ArrowDownUp} />}
      {selected && (
        <Modal
          title="Movement record"
          onClose={() => setSelected(null)}
          footer={
            <>
              <Link href="/audit" className="btn">
                Open audit trail
              </Link>
              <Button onClick={() => setSelected(null)}>Close</Button>
            </>
          }
        >
          <div className="form-grid">
            <div>
              <div className="small-muted">Item</div>
              <strong>{state.medicines.find((item) => item.id === selected.medicineId)?.name}</strong>
            </div>
            <div>
              <div className="small-muted">Type</div>
              <strong>{selected.type}</strong>
            </div>
            <div>
              <div className="small-muted">Change</div>
              <strong>
                {selected.previousQuantity} → {selected.newQuantity} ({selected.quantityChange > 0 ? "+" : ""}
                {selected.quantityChange})
              </strong>
            </div>
            <div>
              <div className="small-muted">Reference</div>
              <strong>{selected.reference || "—"}</strong>
            </div>
          </div>
          <p>{selected.reason}</p>
          <div className="small-muted">
            {state.employees.find((employee) => employee.id === selected.performedBy)?.name || selected.performedBy} · {new Date(selected.timestamp).toLocaleString("en-GH")}
          </div>
          {relatedAudit && <div className="notice" style={{ marginTop: 12 }}>Linked audit: {relatedAudit.action} · {relatedAudit.description}</div>}
        </Modal>
      )}
    </section>
  );
}

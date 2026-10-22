import type { ReactNode } from "react";
import { Package, Search, X } from "lucide-react";
import { formatMoney } from "../lib/repository";

export function Button({
  children,
  onClick,
  variant = "",
  className = "",
  disabled = false,
  testid,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: string;
  className?: string;
  disabled?: boolean;
  testid?: string;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <button
      type={type}
      data-testid={testid || "button-action"}
      disabled={disabled}
      onClick={onClick}
      className={`btn ${variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-icon btn-sm" onClick={onClose} aria-label="Close" data-testid="button-close-modal">
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </section>
    </div>
  );
}

export function Field({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
      {hint && !error && <div className="field-hint">{hint}</div>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder = "Search items, barcode…",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
}) {
  return (
    <div className="searchbox">
      <Search size={15} />
      <input
        className="input"
        data-testid="input-search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && onSubmit?.()}
        placeholder={placeholder}
      />
    </div>
  );
}

export function PageTitle({ title, sub, action }: { title: string; sub: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div className="page-heading-copy">
        <div className="eyebrow">ADOM COMMUNITY PHARMACY</div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {action ? <div className="page-actions">{action}</div> : null}
    </div>
  );
}

export function Empty({ title, detail, icon: Icon = Package }: { title: string; detail: string; icon?: typeof Package }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={19} />
      </div>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function money(cents: number) {
  return formatMoney(cents);
}

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className={`drawer-panel ${wide ? "drawer-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-head">
          <div>
            <h2 id="drawer-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="btn btn-icon btn-sm" onClick={onClose} aria-label="Close drawer" data-testid="button-close-drawer">
            <X size={15} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>
  );
}

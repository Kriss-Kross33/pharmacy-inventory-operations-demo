import type { Role, State } from "./types";

const access: Record<Exclude<Role, "Administrator">, string[]> = {
  "Inventory Viewer": [
    "inventory",
    "medicines",
    "medicine-details",
    "lookup",
    "movements",
    "batch-details",
  ],
  "Sales Operator": [
    "lookup",
    "inventory",
    "medicine-details",
    "pos",
    "sales",
    "sales-own",
  ],
};

export function can(role: Role | undefined, permission: string): boolean {
  if (role === "Administrator") return true;
  if (!role) return false;
  return access[role]?.includes(permission) === true;
}

export function roleFor(state: State): Role | undefined {
  return state.employees.find((employee) => employee.id === state.sessionId)?.role;
}

export function requireActor(state: State) {
  const person = state.employees.find((employee) => employee.id === state.sessionId);
  if (!person || !person.active) {
    throw new Error("Sign in is required.");
  }
  return person;
}

export function assertCan(state: State, permission: string) {
  const person = requireActor(state);
  if (!can(person.role, permission)) {
    throw new Error("You do not have permission to perform this action.");
  }
  return person;
}

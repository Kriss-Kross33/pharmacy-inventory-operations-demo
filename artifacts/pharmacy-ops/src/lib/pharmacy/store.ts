import { useSyncExternalStore } from "react";
import { createLocalStorageRepository } from "./local-storage-repository";
import type { PharmacyRepository } from "./repository";

export const repository: PharmacyRepository = createLocalStorageRepository();

export function useRepository() {
  return useSyncExternalStore(repository.subscribe, repository.getState, repository.getState);
}

export function useStorageError() {
  return useSyncExternalStore(repository.subscribe, repository.getStorageError, repository.getStorageError);
}

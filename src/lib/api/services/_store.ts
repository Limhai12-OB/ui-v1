import { useAppStore } from "@/store/app-store";

/** Access the mock backend state from services (outside React). */
export const db = () => useAppStore.getState();

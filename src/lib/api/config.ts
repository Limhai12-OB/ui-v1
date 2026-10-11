/**
 * API configuration. In "mock" mode services resolve against the local demo
 * store. In "live" mode they call the backend:
 *  - CORE: Spring Boot microservices (accounts, invoices, inventory, …)
 *  - AI:   FastAPI services (OCR/extraction, categorization, advisor, forecasting)
 */
export type ApiMode = "mock" | "live";

export const API_MODE: ApiMode = process.env.NEXT_PUBLIC_API_MODE === "live" ? "live" : "mock";
export const CORE_API_URL = process.env.NEXT_PUBLIC_CORE_API_URL ?? "http://localhost:8080/api/v1";
export const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL ?? "http://localhost:8000/ai/v1";

export const isMock = API_MODE === "mock";

export interface HealthResponse {
    status: string;
    version: string;
}

export const API_BASE_URL = "http://localhost:8000";

export * from './session';

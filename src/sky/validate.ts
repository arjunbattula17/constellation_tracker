export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateCoordinates(latitude: number, longitude: number): ValidationResult {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { valid: false, error: "latitude must be a number between -90 and 90" };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { valid: false, error: "longitude must be a number between -180 and 180" };
  }
  return { valid: true };
}

export function shouldEnforceRule(params: {
  precision: number;
  minimumPrecision: number;
  minimumVerifiedFindings: number;
  totalVerifiedFindings: number;
}): boolean {
  if (params.totalVerifiedFindings < params.minimumVerifiedFindings) {
    return false;
  }
  return params.precision >= params.minimumPrecision;
}

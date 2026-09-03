/** Pick a human unit for an integrated luminosity given in m⁻². */
export function integratedLuminosityDisplay(valueM2: number): { value: number; unitKey: string } {
  const invNb = valueM2 / 1e37;
  if (invNb < 1000) return { value: invNb, unitKey: 'unit.invNb' };
  const invPb = valueM2 / 1e40;
  if (invPb < 1000) return { value: invPb, unitKey: 'unit.invPb' };
  return { value: valueM2 / 1e43, unitKey: 'unit.invFb' };
}

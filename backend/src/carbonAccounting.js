/**
 * IPCC 2006 Guidelines for National Greenhouse Gas Inventories
 * Volume 4: Agriculture, Forestry and Other Land Use
 * Chapter 2 / Chapter 4 — soil organic carbon stock change.
 *
 * SOC stock (t C ha-1) = SOC(%)/100 * BD(t m-3) * depth(cm) * (1 - CF) * 100
 * which simplifies to: SOC(%) * BD * depth_cm * (1 - CF)
 *
 * CO2e (t CO2e ha-1) = ΔC (t C ha-1) * 44/12
 *
 * One voluntary carbon credit is accounted as 1 t CO2e (market convention),
 * not a hard-coded "1% SOC = N credits".
 */

export const METHODOLOGY =
  "IPCC 2006 AFOLU soil carbon stock (SOC % × bulk density × depth × (1 − coarse fragments)) with CO2e = ΔC × 44/12. Academic prototype — not an issued offset.";

export function carbonStockTcha(socPercent, bulkDensity, depthCm, coarseFrac = 0) {
  const soc = Number(socPercent);
  const bd = Number(bulkDensity || 1.3);
  const d = Number(depthCm || 20);
  const cf = Math.min(Math.max(Number(coarseFrac || 0), 0), 0.9);
  if (!Number.isFinite(soc) || soc < 0) return null;
  return soc * bd * d * (1 - cf);
}

export function account({
  socBefore,
  socAfter,
  socBeforeSource,
  socAfterSource,
  bulkDensity = 1.3,
  depthCm = 20,
  coarseFragmentFraction = 0,
  areaHa = 0,
}) {
  const stockBefore = carbonStockTcha(socBefore, bulkDensity, depthCm, coarseFragmentFraction);
  const stockAfter = carbonStockTcha(socAfter, bulkDensity, depthCm, coarseFragmentFraction);
  const stockChange = stockAfter != null && stockBefore != null ? stockAfter - stockBefore : null;
  const co2ePerHa = stockChange != null ? stockChange * (44 / 12) : null;
  const estimatedCredits = co2ePerHa != null && areaHa > 0 ? co2ePerHa * areaHa : null;
  const eligibility =
    estimatedCredits != null && estimatedCredits > 0
      ? "ELIGIBLE_PENDING_VERIFICATION"
      : "NOT_ELIGIBLE_NON_POSITIVE_OR_INCOMPLETE";

  return {
    socBefore,
    socAfter,
    socChange: socAfter != null && socBefore != null ? socAfter - socBefore : null,
    socBeforeSource,
    socAfterSource,
    bulkDensity,
    depthCm,
    coarseFragmentFraction,
    carbonStockBefore: stockBefore != null ? round(stockBefore) : null,
    carbonStockAfter: stockAfter != null ? round(stockAfter) : null,
    carbonStockChange: stockChange != null ? round(stockChange) : null,
    co2eTonnesPerHa: co2ePerHa != null ? round(co2ePerHa) : null,
    areaHa,
    estimatedCredits: estimatedCredits != null ? round(estimatedCredits, 3) : null,
    eligibilityStatus: eligibility,
    verificationStatus: "ESTIMATED",
    methodology: METHODOLOGY,
    assumptions: [
      "Bulk density default 1.3 g/cm3 (typical mineral soil) when not measured — flagged as estimated.",
      "Coarse fragment fraction default 0 unless provided.",
      "Positive CO2e only is treated as credit-eligible pending admin verification.",
      "This is not Verra/Gold Standard issuance.",
    ],
  };
}

function round(n, p = 3) {
  return Number(Number(n).toFixed(p));
}

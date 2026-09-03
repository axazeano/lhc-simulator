/**
 * Simplified barrel geometry of a general-purpose LHC detector for the event display, in metres.
 * Numbers follow the CMS layout (CMS Collaboration, JINST 3 (2008) S08004): a 3.8 T solenoid,
 * a tracker out to 1.1 m, the crystal calorimeter at 1.3–1.8 m, the hadron calorimeter at
 * 1.8–2.9 m, the coil at 3 m and muon stations out to about 7 m. Simplification: perfect
 * cylinders, no endcap details beyond flat discs.
 */
export const DETECTOR_GEOMETRY = {
  solenoidFieldT: 3.8,
  beamPipeRadiusM: 0.03,
  trackerLayersM: [0.1, 0.2, 0.35, 0.5, 0.7, 0.9, 1.1],
  trackerRadiusM: 1.1,
  trackerHalfLengthM: 2.7,
  ecalInnerM: 1.3,
  ecalOuterM: 1.8,
  ecalHalfLengthM: 3.2,
  hcalInnerM: 1.8,
  hcalOuterM: 2.9,
  hcalHalfLengthM: 3.9,
  solenoidInnerM: 2.95,
  solenoidOuterM: 3.6,
  muonStationsM: [4.2, 5.0, 6.0, 7.0],
  muonOuterM: 7.4,
  muonHalfLengthM: 7.0,
  /** Discs (endcaps) at |z| for calorimeters and muon system. */
  endcapEcalZM: 3.3,
  endcapHcalZM: 4.0,
  endcapMuonZM: [7.5, 8.5, 9.5, 10.5],
  outerHalfLengthM: 11,
} as const;

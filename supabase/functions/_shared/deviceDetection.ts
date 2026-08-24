/**
 * Device-list predicates shared by the AMMP sync and the device enrichment.
 *
 * Only the predicates that must agree between the two functions live here —
 * battery-only detection above all, because the invoice calculator, the zero-PV
 * alerts and the support documents all key off `isBatteryOnly`. Battery, genset
 * and EMS detection stay in each function: the enrichment sees richer device
 * metadata than the sync and deliberately casts a wider net there.
 */

export interface DeviceLike {
  device_type?: string | null;
  device_name?: string | null;
  device_metadata?: Record<string, any> | null;
}

/** A device that reports PV production (battery inverters excluded). */
export function hasPvInverter(devices: DeviceLike[]): boolean {
  return devices.some((d) => {
    const type = (d.device_type || '').toLowerCase();
    if (type === 'battery_inverter') return false;
    return type === 'pv_inverter' || type === 'inverter' || type.includes('pv');
  });
}

/** An EMS/meter/satellite that could still be delivering PV data. */
export function hasPvCapablePeripheral(devices: DeviceLike[]): boolean {
  return devices.some((d) => {
    const type = (d.device_type || '').toLowerCase();
    const name = (d.device_name || '').toLowerCase();
    if (type !== 'ems' && type !== 'meter' && type !== 'satellite') return false;
    return type === 'satellite' || name.includes('pv') || name.includes('solar');
  });
}

/** Meters named after a genset or a battery, which imply a hybrid site. */
export function hasHybridMeter(devices: DeviceLike[]): boolean {
  return devices.some((d) => {
    if (d.device_type !== 'meter') return false;
    const name = (d.device_name || '').toLowerCase();
    return (
      name.includes('gen') ||
      name.includes('genset') ||
      name.includes('generator') ||
      name.includes('battery') ||
      name.includes('batt') ||
      name.includes('bess')
    );
  });
}

/**
 * Storage present, no PV inverter and nothing else that could report PV, with a
 * registered PV capacity of zero. An empty device list means "unknown", never
 * "battery-only" — such sites keep raising zero-PV alerts instead.
 */
export function isBatteryOnlySite(args: {
  devices: DeviceLike[];
  hasBattery: boolean;
  capacityKWp: number;
}): boolean {
  const { devices, hasBattery, capacityKWp } = args;
  return (
    devices.length > 0 &&
    hasBattery &&
    !hasPvInverter(devices) &&
    !hasPvCapablePeripheral(devices) &&
    Number(capacityKWp || 0) === 0
  );
}

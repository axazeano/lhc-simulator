/** Time-speed knob: how many game seconds pass per real second. */
export interface TimeSpeedOption {
  factor: number;
  labelKey: string;
}

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const MONTH = 30 * DAY;

export const TIME_SPEED_OPTIONS: readonly TimeSpeedOption[] = [
  { factor: 1, labelKey: 'timeSpeed.realtime' },
  { factor: 10, labelKey: 'timeSpeed.x10' },
  { factor: MINUTE, labelKey: 'timeSpeed.minutePerSecond' },
  { factor: 10 * MINUTE, labelKey: 'timeSpeed.tenMinutesPerSecond' },
  { factor: HOUR, labelKey: 'timeSpeed.hourPerSecond' },
  { factor: DAY, labelKey: 'timeSpeed.dayPerSecond' },
  { factor: MONTH, labelKey: 'timeSpeed.monthPerSecond' },
];

/** Split seconds into the largest convenient unit for display. */
export function humanDuration(seconds: number): { value: number; unitKey: string } {
  if (seconds < MINUTE) return { value: seconds, unitKey: 'duration.seconds' };
  if (seconds < HOUR) return { value: seconds / MINUTE, unitKey: 'duration.minutes' };
  if (seconds < DAY) return { value: seconds / HOUR, unitKey: 'duration.hours' };
  return { value: seconds / DAY, unitKey: 'duration.days' };
}

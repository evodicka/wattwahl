import { z } from 'zod';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * Per-device settings (architecture 8.2). They stay on the device, are not part
 * of a scenario and are never exported.
 */
export const DeviceSettingsSchema = z.object({
  activeScenarioId: z.uuid().nullable(),
  /** ISO 8601 timestamp of the last export, `null` if never exported. */
  lastExportAt: z.iso.datetime().nullable(),
  exportReminderDays: z.number().int().min(1),
  /** User-chosen traffic light colors; `null` keeps the theme colors. */
  trafficLightColors: z
    .object({ green: color, yellow: color, red: color })
    .nullable(),
  firstRunCompleted: z.boolean(),
});
export type DeviceSettings = z.infer<typeof DeviceSettingsSchema>;

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  activeScenarioId: null,
  lastExportAt: null,
  exportReminderDays: 14,
  trafficLightColors: null,
  firstRunCompleted: false,
};

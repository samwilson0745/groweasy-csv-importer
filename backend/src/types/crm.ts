/**
 * Canonical GrowEasy CRM record shape and supporting enums/types.
 */

export const CRM_STATUS_VALUES = [
  "GOOD_LEAD_FOLLOW_UP",
  "DID_NOT_CONNECT",
  "BAD_LEAD",
  "SALE_DONE",
] as const;

export type CrmStatus = (typeof CRM_STATUS_VALUES)[number];

export const DATA_SOURCE_VALUES = [
  "leads_on_demand",
  "meridian_tower",
  "eden_park",
  "varah_swamy",
  "sarjapur_plots",
] as const;

export type DataSource = (typeof DATA_SOURCE_VALUES)[number];

/** The 15 canonical CRM fields the AI must attempt to populate. */
export interface CrmRecord {
  created_at: string | null;
  name: string | null;
  email: string | null;
  country_code: string | null;
  mobile_without_country_code: string | null;
  company: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  lead_owner: string | null;
  crm_status: CrmStatus | "" | null;
  crm_note: string | null;
  data_source: DataSource | "" | null;
  possession_time: string | null;
  description: string | null;
}

export const CRM_FIELDS: (keyof CrmRecord)[] = [
  "created_at",
  "name",
  "email",
  "country_code",
  "mobile_without_country_code",
  "company",
  "city",
  "state",
  "country",
  "lead_owner",
  "crm_status",
  "crm_note",
  "data_source",
  "possession_time",
  "description",
];

/** A raw row parsed straight out of the uploaded CSV, keys = original headers. */
export type RawRow = Record<string, string>;

export interface SkippedRecord {
  row: RawRow;
  rowIndex: number;
  reason: string;
}

export interface CountBreakdown {
  label: string;
  count: number;
}

export interface ImportSummary {
  /** Percentage (0-100, one decimal) of rows successfully imported. */
  successRate: number;
  /** One-sentence, human-readable recap of the import - ready to display as-is. */
  headline: string;
  /** Skip reasons grouped and counted, most common first. */
  skipReasons: CountBreakdown[];
  /** crm_status distribution among imported records, most common first. Blank status shown as "Unspecified". */
  statusBreakdown: CountBreakdown[];
  /** data_source distribution among imported records, most common first. Blank source shown as "Unspecified". */
  dataSourceBreakdown: CountBreakdown[];
}

export interface ImportResult {
  imported: CrmRecord[];
  skipped: SkippedRecord[];
  totalRows: number;
  totalImported: number;
  totalSkipped: number;
  batches: number;
  summary: ImportSummary;
}

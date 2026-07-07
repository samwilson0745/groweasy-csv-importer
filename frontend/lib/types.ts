// Mirrors backend/src/types/crm.ts - kept in sync manually since the two
// apps are deployed independently. If this project grows, this would move
// into a shared workspace package.

export const CRM_STATUS_VALUES = [
  "GOOD_LEAD_FOLLOW_UP",
  "DID_NOT_CONNECT",
  "BAD_LEAD",
  "SALE_DONE",
] as const;

export const DATA_SOURCE_VALUES = [
  "leads_on_demand",
  "meridian_tower",
  "eden_park",
  "varah_swamy",
  "sarjapur_plots",
] as const;

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
  crm_status: string | null;
  crm_note: string | null;
  data_source: string | null;
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
  successRate: number;
  headline: string;
  skipReasons: CountBreakdown[];
  statusBreakdown: CountBreakdown[];
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

export type AppStep = "upload" | "preview" | "processing" | "results";

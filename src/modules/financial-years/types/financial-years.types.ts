// A financial year — practice-wide master data. `year` is a free-text label
// (e.g. '2024-25'); at most one row is flagged `is_current` at a time.
export interface FinancialYear {
  id: string
  year: string
  is_current: boolean
  created_at: string
  updated_at: string
}

export interface CreateFinancialYearRequest {
  year: string
  is_current: boolean
}

export interface UpdateFinancialYearRequest {
  year?: string
  is_current?: boolean
}

export interface FinancialYearListResponse {
  items: FinancialYear[]
}

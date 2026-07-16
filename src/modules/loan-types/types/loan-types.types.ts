// A loan type — practice-wide master data (e.g. Home Loan, Car Loan, Refinance).
// A flat name + description lookup row the mortgage task picks from.
export interface LoanType {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface CreateLoanTypeRequest {
  name: string
  description?: string | null
}

export interface UpdateLoanTypeRequest {
  name?: string
  description?: string | null
}

export interface LoanTypeListResponse {
  items: LoanType[]
}

import type { ServiceFrequency } from '../../../config/service-frequencies.constants'
import type { DepartmentCode } from '../../../config/departments.constants'

// A service — master data. Belongs to exactly one department (fixed at creation),
// and carries a name, code, optional description, and one or more fixed
// frequencies it can be delivered at.
export interface Service {
  id: string
  department: DepartmentCode
  name: string
  code: string
  description: string | null
  frequencies: ServiceFrequency[]
  // When true, this service is auto-attached to every newly created client.
  auto_added: boolean
  created_at: string
  updated_at: string
}

export interface CreateServiceRequest {
  department: DepartmentCode
  name: string
  code: string
  description?: string | null
  frequencies: ServiceFrequency[]
  auto_added?: boolean
}

// Department is fixed at creation, so it is not editable here (mirrors firms).
export interface UpdateServiceRequest {
  name?: string
  code?: string
  description?: string | null
  frequencies?: ServiceFrequency[]
  auto_added?: boolean
}

export interface ServiceListResponse {
  items: Service[]
}

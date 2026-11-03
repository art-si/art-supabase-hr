import { buildSupabaseRpcRange } from '@/utils/supabase'
import { normalizeNullableText } from '@/utils/form/normalize'
import { useSupabase } from '@/hooks/core/useSupabase'
import type { ApiFeedbackOptions } from '@/types/api/request'
import TreeUtils from '@/utils/tree'

type Employee = Api.Hr.Employee
type EmployeeSearchParams = Api.Hr.EmployeeSearchParams
type EmployeeProfile = Api.Hr.EmployeeProfile
type EmployeeProfilePayload = Api.Hr.EmployeeProfilePayload
type OrganizationScopeFilterItem = Api.SystemManage.OrganizationScopeFilterItem

interface EmployeeListPayload {
  records?: Employee[]
  total?: number
  fieldAccess?: Api.Hr.EmployeeFieldAccessMap
}

interface OrganizationPositionDirectoryPayload {
  positions?: Api.Hr.Position[]
  employees?: Api.Hr.OrganizationPositionEmployee[]
  employeeTotal?: number
  truncated?: boolean
}

const organizationTreeUtils = new TreeUtils({
  idKey: 'id',
  parentKey: 'parentId',
  childrenKey: 'children'
})

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

const normalizeEmployeeProfile = (profile: EmployeeProfile): EmployeeProfile => ({
  ...profile,
  contracts: Array.isArray(profile.contracts) ? profile.contracts : [],
  educations: Array.isArray(profile.educations) ? profile.educations : [],
  workExperiences: Array.isArray(profile.workExperiences) ? profile.workExperiences : [],
  trainings: Array.isArray(profile.trainings) ? profile.trainings : [],
  rewards: Array.isArray(profile.rewards) ? profile.rewards : []
})

export async function fetchEmployeeList(params: EmployeeSearchParams) {
  const { from = 0, to = 9 } = params
  const result = await responseHandle<EmployeeListPayload>(
    () =>
      supabase.rpc('hr_list_employees_secure', {
        ...buildSupabaseRpcRange(from, to),
        p_tenant_id: params.tenantId || null,
        p_organization_ids: params.organizationIds?.length ? params.organizationIds : null,
        p_organization_unassigned: Boolean(params.organizationUnassigned),
        p_employment_status: params.employmentStatus || null,
        p_employment_type: params.employmentType || null,
        p_keyword: normalizeNullableText(params.keyword),
        p_hire_start: params.hireDateRange?.[0] || null,
        p_hire_end: params.hireDateRange?.[1] || null,
        p_record_id: params.recordId || null
      }),
    { showErrorMessage: true }
  )

  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: result.data?.fieldAccess ?? {}
  }
}

export async function deleteEmployee(id: string) {
  return await responseHandle<void>(
    () => supabase.rpc('hr_delete_employee_secure', { p_employee_id: id }),
    {
      showMessage: true,
      message: '员工档案已删除',
      breakReturn: true
    }
  )
}

export async function fetchEmployeeOrganizationTree(params: { tenantId?: string } = {}) {
  const response = await responseHandle<OrganizationScopeFilterItem[]>(
    () =>
      supabase.rpc('hr_list_employee_organization_scope_secure', {
        p_tenant_id: params.tenantId || null
      }),
    { showErrorMessage: true }
  )

  return {
    ...response,
    data: organizationTreeUtils.listToTree(response.data ?? [], (a, b) => {
      const tenantDiff = (a.tenant?.tenantName ?? '').localeCompare(
        b.tenant?.tenantName ?? '',
        'zh-CN'
      )
      const sortDiff = (a.sort ?? 0) - (b.sort ?? 0)
      return tenantDiff || sortDiff || a.organizationName.localeCompare(b.organizationName, 'zh-CN')
    })
  }
}

export async function fetchOrganizationPositionDirectory(
  organizationId?: string,
  options: ApiFeedbackOptions = {}
): Promise<{ data: Api.Hr.OrganizationPositionDirectory; error: unknown | null }> {
  const response = await responseHandle<OrganizationPositionDirectoryPayload>(
    () =>
      supabase.rpc('hr_get_organization_position_directory_secure', {
        p_organization_id: organizationId || null
      }),
    { showErrorMessage: options.showErrorMessage ?? true }
  )
  const positions = (response.data?.positions ?? [])
    .filter((position) => Boolean(position.id))
    .sort(
      (a, b) =>
        (a.sort ?? 0) - (b.sort ?? 0) || a.positionName.localeCompare(b.positionName, 'zh-CN')
    )

  return {
    data: {
      positions,
      employees: response.data?.employees ?? [],
      employeeTotal: response.data?.employeeTotal ?? 0,
      truncated: Boolean(response.data?.truncated)
    },
    error: response.error
  }
}

export async function fetchEmployeeProfile(employeeId: string): Promise<EmployeeProfile | null> {
  const response = await responseHandle<EmployeeProfile>(
    () => supabase.rpc('hr_get_employee_profile_secure', { p_employee_id: employeeId }),
    { breakReturn: true, showErrorMessage: true }
  )
  return response.data ? normalizeEmployeeProfile(response.data) : null
}

export async function saveEmployeeProfile(payload: EmployeeProfilePayload): Promise<string> {
  const response = await responseHandle<string>(
    () =>
      supabase.rpc('hr_save_employee_profile_secure', {
        p_payload: keysToSnakeDeep(payload)
      }),
    {
      breakReturn: true,
      showMessage: false
    }
  )
  if (!response.data) throw new Error('保存员工档案后未返回员工 ID')
  return response.data
}

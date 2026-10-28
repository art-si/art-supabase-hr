import { buildSupabaseRpcRange } from '@/utils/supabase'
import { normalizeNullableText } from '@/utils/form/normalize'
import { omit } from 'lodash-es'
import { useSupabase } from '@/hooks/core/useSupabase'
import { withRequestOptions } from '@/api/providers/supabase/query'
import type { ApiFeedbackOptions, ApiRequestOptions } from '@/types/api/request'

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

export async function fetchWorkforcePlanningOverview(
  tenantId?: string,
  options: ApiRequestOptions & ApiFeedbackOptions = {}
) {
  return await responseHandle<Api.Hr.WorkforcePlanningOverview>(
    () =>
      withRequestOptions(
        supabase.rpc('hr_workforce_overview_secure', { p_tenant_id: tenantId || null }),
        options
      ),
    { showErrorMessage: options.showErrorMessage ?? true }
  )
}

export async function fetchWorkforcePlanningRecords<TRecord extends Api.Hr.WorkforcePlanningRecord>(
  entity: Api.Hr.WorkforcePlanningEntity,
  params: Api.Hr.WorkforcePlanningSearchParams,
  options: ApiRequestOptions & ApiFeedbackOptions = {}
) {
  const from = Math.max(params.from ?? 0, 0)
  const result = await responseHandle<Api.Hr.WorkforcePlanningListResult<TRecord>>(
    () =>
      withRequestOptions(
        supabase.rpc('hr_list_workforce_records_secure', {
          p_kind: entity,
          ...buildSupabaseRpcRange(from, params.to ?? from + 19),
          p_keyword: normalizeNullableText(params.keyword),
          p_status: params.status || null,
          p_plan_id: params.planId || null,
          p_tenant_id: params.tenantId || null
        }),
        options
      ),
    { showErrorMessage: options.showErrorMessage ?? true }
  )
  return { data: result.data?.records ?? [], total: result.data?.total ?? 0, error: result.error }
}

export async function fetchWorkforcePlanningOptions(
  kind: Api.Hr.WorkforcePlanningOptionKind,
  tenantId?: string,
  options: ApiRequestOptions & ApiFeedbackOptions = {}
) {
  return await responseHandle<Api.Hr.WorkforcePlanningReference[]>(
    () =>
      withRequestOptions(
        supabase.rpc('hr_list_workforce_options_secure', {
          p_kind: kind,
          p_tenant_id: tenantId || null
        }),
        options
      ),
    { showErrorMessage: options.showErrorMessage ?? true }
  )
}

const normalizePayload = (record: Api.Hr.WorkforcePlanningRecord) =>
  keysToSnakeDeep(
    omit(record, [
      'id',
      'tenant',
      'owner',
      'plan',
      'organization',
      'position',
      'lineCount',
      'baselineCount',
      'targetCount',
      'plannedPayroll',
      'currentCount',
      'forecastGap',
      'vacancyCount',
      'requisitionCount',
      'recruitingCount',
      'planStatus',
      'approvedBy',
      'approvedAt',
      'activatedAt',
      'closedAt',
      'createTime',
      'updateTime'
    ])
  )

export async function saveWorkforcePlanningRecord(
  entity: Api.Hr.WorkforcePlanningEntity,
  record: Api.Hr.WorkforcePlanningRecord
) {
  const label = { cycle: '规划周期', line: '岗位需求', effective: '有效编制' }[entity]
  return await responseHandle<string>(
    () =>
      supabase.rpc('hr_save_workforce_record_secure', {
        p_kind: entity,
        p_id: record.id ?? null,
        p_payload: normalizePayload(record)
      }),
    {
      showMessage: true,
      breakReturn: true,
      message: record.id ? `${label}已更新` : `${label}已创建`
    }
  )
}

export async function transitionWorkforcePlan(
  id: string,
  action: Api.Hr.WorkforcePlanAction,
  comment?: string
) {
  const messages: Record<Api.Hr.WorkforcePlanAction, string> = {
    submit: '人力规划已提交审批',
    return: '人力规划已退回修订',
    cancel: '人力规划已取消',
    approve: '人力规划已批准',
    activate: '人力规划已启用并同步岗位容量',
    close: '人力规划已关闭'
  }
  return await responseHandle<boolean>(
    () =>
      supabase.rpc('hr_transition_workforce_plan_secure', {
        p_id: id,
        p_action: action,
        p_comment: normalizeNullableText(comment)
      }),
    { showMessage: true, breakReturn: true, message: messages[action] }
  )
}

export async function deleteWorkforcePlanningRecord(
  entity: Api.Hr.WorkforcePlanningEntity,
  id: string
) {
  return await responseHandle<boolean>(
    () => supabase.rpc('hr_delete_workforce_record_secure', { p_kind: entity, p_id: id }),
    { showMessage: true, breakReturn: true, message: '人力规划记录已删除' }
  )
}

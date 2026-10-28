import { buildSupabaseRpcRange } from '@/utils/supabase'
import { normalizeNullableText } from '@/utils/form/normalize'
import { omit } from 'lodash-es'
import { useSupabase } from '@/hooks/core/useSupabase'
import { withRequestOptions } from '@/api/providers/supabase/query'
import type { ApiFeedbackOptions, ApiRequestOptions } from '@/types/api/request'
import { createEmployeeReferenceSelector } from '@/api/integration/employees'

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

export async function fetchPerformanceOverview(
  tenantId?: string,
  options: ApiRequestOptions & ApiFeedbackOptions = {}
) {
  return await responseHandle<Api.Hr.PerformanceOverview>(
    () =>
      withRequestOptions(
        supabase.rpc('hr_performance_overview_secure', { p_tenant_id: tenantId || null }),
        options
      ),
    { showErrorMessage: options.showErrorMessage ?? true }
  )
}

export async function fetchPerformanceRecords<TRecord extends Api.Hr.PerformanceRecord>(
  entity: Api.Hr.PerformanceEntity,
  params: Api.Hr.PerformanceSearchParams,
  options: ApiRequestOptions & ApiFeedbackOptions = {}
) {
  const from = Math.max(params.from ?? 0, 0)
  const result = await responseHandle<Api.Hr.PerformanceListResult<TRecord>>(
    () =>
      withRequestOptions(
        supabase.rpc('hr_list_performance_records_secure', {
          p_kind: entity,
          ...buildSupabaseRpcRange(from, params.to ?? from + 19),
          p_keyword: normalizeNullableText(params.keyword),
          p_status: params.status || null,
          p_cycle_id: params.cycleId || null,
          p_session_id: params.sessionId || null,
          p_tenant_id: params.tenantId || null
        }),
        options
      ),
    { showErrorMessage: options.showErrorMessage ?? true }
  )
  return { data: result.data?.records ?? [], total: result.data?.total ?? 0, error: result.error }
}

export async function fetchPerformanceOptions(
  kind: Api.Hr.PerformanceOptionKind,
  tenantId?: string,
  options: ApiRequestOptions & ApiFeedbackOptions = {}
) {
  return await responseHandle<Api.Hr.PerformanceReference[]>(
    () =>
      withRequestOptions(
        supabase.rpc('hr_list_performance_options_secure', {
          p_kind: kind,
          p_tenant_id: tenantId || null
        }),
        options
      ),
    { showErrorMessage: options.showErrorMessage ?? true }
  )
}

export const fetchPerformanceEmployeeSelector = createEmployeeReferenceSelector((tenantId) =>
  fetchPerformanceOptions('employee', tenantId)
)

const normalizePayload = (record: Api.Hr.PerformanceRecord) =>
  keysToSnakeDeep(
    omit(record, [
      'id',
      'cycle',
      'employee',
      'reviewer',
      'organization',
      'owner',
      'facilitator',
      'session',
      'reviewCount',
      'completedCount',
      'pendingCalibrationCount',
      'goalCount',
      'goalWeight',
      'lastCheckInDate',
      'latestRiskStatus',
      'latestProgressPercent',
      'itemCount',
      'adjustedCount',
      'reviewStatus',
      'createTime',
      'updateTime'
    ])
  )

export async function savePerformanceRecord(
  entity: Api.Hr.PerformanceEntity,
  record: Api.Hr.PerformanceRecord
) {
  const labels: Record<Api.Hr.PerformanceEntity, string> = {
    cycle: '绩效周期',
    review: '员工考核',
    goal: '绩效目标',
    check_in: '绩效沟通',
    calibration: '校准会议',
    calibration_item: '校准评分'
  }
  return await responseHandle<string>(
    () =>
      supabase.rpc('hr_save_performance_record_secure', {
        p_kind: entity,
        p_id: record.id ?? null,
        p_payload: normalizePayload(record)
      }),
    {
      showMessage: true,
      breakReturn: true,
      message: record.id ? `${labels[entity]}已更新` : `${labels[entity]}已创建`
    }
  )
}

export async function transitionPerformanceCycle(
  id: string,
  action: Api.Hr.PerformanceCycleAction,
  comment?: string
) {
  const messages: Record<Api.Hr.PerformanceCycleAction, string> = {
    activate: '绩效周期已启动，自评阶段已开放',
    begin_review: '绩效周期已进入评议阶段',
    complete: '绩效周期已完成',
    cancel: '绩效周期已取消'
  }
  return await responseHandle<boolean>(
    () =>
      supabase.rpc('hr_transition_performance_cycle_secure', {
        p_id: id,
        p_action: action,
        p_comment: normalizeNullableText(comment)
      }),
    { showMessage: true, breakReturn: true, message: messages[action] }
  )
}

export async function transitionPerformanceReview(
  id: string,
  action: Api.Hr.PerformanceReviewAction,
  comment?: string
) {
  const messages: Record<Api.Hr.PerformanceReviewAction, string> = {
    submit_self: '员工自评已提交',
    submit_manager: '主管评价已提交，结果等待校准',
    complete: '绩效结果已确认完成'
  }
  return await responseHandle<boolean>(
    () =>
      supabase.rpc('hr_transition_performance_review_secure', {
        p_id: id,
        p_action: action,
        p_comment: normalizeNullableText(comment)
      }),
    { showMessage: true, breakReturn: true, message: messages[action] }
  )
}

export async function transitionPerformanceCalibration(
  id: string,
  action: Api.Hr.PerformanceCalibrationAction,
  comment?: string
) {
  const messages: Record<Api.Hr.PerformanceCalibrationAction, string> = {
    start: '校准会议已开始，待校准结果已载入',
    approve: '校准结果已定案并回写员工绩效',
    deactivate: '校准会议已停用'
  }
  return await responseHandle<boolean>(
    () =>
      supabase.rpc('hr_transition_performance_calibration_secure', {
        p_id: id,
        p_action: action,
        p_comment: normalizeNullableText(comment)
      }),
    { showMessage: true, breakReturn: true, message: messages[action] }
  )
}

export function getPerformanceDeleteTable(entity: Api.Hr.PerformanceEntity): string | null {
  const tables: Partial<Record<Api.Hr.PerformanceEntity, string>> = {
    cycle: 'hr_performance_cycle',
    review: 'hr_performance_review',
    goal: 'hr_performance_goal',
    check_in: 'hr_performance_check_in',
    calibration: 'hr_performance_calibration_session'
  }
  return tables[entity] ?? null
}

export async function deletePerformanceRecord(entity: Api.Hr.PerformanceEntity, id: string) {
  return await responseHandle<boolean>(
    () => supabase.rpc('hr_delete_performance_record_secure', { p_kind: entity, p_id: id }),
    { showMessage: true, breakReturn: true, message: '绩效记录已删除' }
  )
}

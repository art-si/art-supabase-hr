import { buildSupabaseRpcRange } from '@/utils/supabase'
import { normalizeNullableText } from '@/utils/form/normalize'
import { omit } from 'lodash-es'
import { useSupabase } from '@/hooks/core/useSupabase'
import { withRequestOptions } from '@/api/providers/supabase/query'
import type { ApiRequestOptions } from '@/types/api/request'

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

export async function fetchEmployeeExperienceOverview(
  tenantId?: string,
  options?: ApiRequestOptions
) {
  return await responseHandle<Api.Hr.EmployeeExperienceOverview>(
    () =>
      withRequestOptions(
        supabase.rpc('hr_employee_experience_overview_secure', {
          p_tenant_id: tenantId || null
        }),
        options
      ),
    { showErrorMessage: true }
  )
}

export async function fetchEmployeeExperienceRecords<
  TRecord extends Api.Hr.EmployeeExperienceRecord
>(
  entity: Api.Hr.EmployeeExperienceEntity,
  params: Api.Hr.EmployeeExperienceSearchParams,
  options?: ApiRequestOptions
) {
  const from = Math.max(params.from ?? 0, 0)
  const result = await responseHandle<Api.Hr.EmployeeExperienceListResult<TRecord>>(
    () =>
      withRequestOptions(
        supabase.rpc('hr_list_employee_experience_records_secure', {
          p_kind: entity,
          ...buildSupabaseRpcRange(from, params.to ?? from + 19),
          p_keyword: normalizeNullableText(params.keyword),
          p_status: params.status || null,
          p_survey_type: params.surveyType || null,
          p_tenant_id: params.tenantId || null
        }),
        options
      ),
    { showErrorMessage: true }
  )
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
    privacyNote: result.data?.privacyNote
  }
}

export async function fetchEmployeeExperienceDetail<
  TDetail extends Api.Hr.EmployeeExperienceRecord
>(
  entity: Api.Hr.EmployeeExperienceEntity,
  id: string,
  dimension?: string,
  options?: ApiRequestOptions
) {
  return await responseHandle<TDetail>(
    () =>
      withRequestOptions(
        supabase.rpc('hr_get_employee_experience_detail_secure', {
          p_kind: entity,
          p_id: id,
          p_dimension: dimension || null
        }),
        options
      ),
    { showErrorMessage: true }
  )
}

const normalizeRecordPayload = (
  kind: Api.Hr.EmployeeExperienceRecordKind,
  record:
    | Api.Hr.EmployeeExperienceSurvey
    | Api.Hr.EmployeeExperienceQuestion
    | Api.Hr.EmployeeExperienceAction
) =>
  keysToSnakeDeep(
    omit(record, [
      'audienceOrganizationName',
      'audienceOrganization',
      'questions',
      'events',
      'questionCount',
      'participantCount',
      'completedCount',
      'responseRate',
      ...(kind === 'survey' ? [] : ['surveyCode', 'surveyName']),
      'organizationName',
      'ownerEmployeeNo',
      'ownerEmployeeName',
      'ownerJobTitle',
      'dueStatus',
      'survey',
      'organization',
      'ownerEmployee',
      'createTime',
      'updateTime'
    ])
  )

export async function saveEmployeeExperienceRecord(
  kind: Api.Hr.EmployeeExperienceRecordKind,
  record:
    | Api.Hr.EmployeeExperienceSurvey
    | Api.Hr.EmployeeExperienceQuestion
    | Api.Hr.EmployeeExperienceAction
) {
  const labels: Record<Api.Hr.EmployeeExperienceRecordKind, string> = {
    survey: '员工体验调查',
    question: '调查题目',
    action: '改进行动'
  }
  return await responseHandle<string>(
    () =>
      supabase.rpc('hr_save_employee_experience_record_secure', {
        p_kind: kind,
        p_payload: normalizeRecordPayload(kind, record)
      }),
    {
      showMessage: true,
      breakReturn: true,
      message: `${labels[kind]}已${record.id ? '更新' : '创建'}`
    }
  )
}

export async function transitionEmployeeExperienceRecord(
  kind: 'survey' | 'action',
  id: string,
  action: Api.Hr.EmployeeExperienceTransitionAction,
  comment?: string
) {
  const messages: Record<Api.Hr.EmployeeExperienceTransitionAction, string> = {
    launch: '员工体验调查已发布',
    open: '员工体验调查已开放',
    close: '员工体验调查已关闭',
    cancel: kind === 'survey' ? '员工体验调查已取消' : '改进行动已取消',
    start: '改进行动已启动',
    complete: '改进行动已验收完成'
  }
  return await responseHandle<boolean>(
    () =>
      supabase.rpc('hr_transition_employee_experience_record_secure', {
        p_kind: kind,
        p_id: id,
        p_action: action,
        p_comment: normalizeNullableText(comment)
      }),
    { showMessage: true, breakReturn: true, message: messages[action] }
  )
}

export async function submitEmployeeExperienceResponse(
  participantId: string,
  answers: Api.Hr.EmployeeExperienceAnswerInput[]
) {
  return await responseHandle<string>(
    () =>
      supabase.rpc('hr_submit_employee_experience_response_secure', {
        p_participant_id: participantId,
        p_answers: keysToSnakeDeep(answers)
      }),
    {
      showMessage: true,
      breakReturn: true,
      message: '匿名调查已提交，感谢您的反馈'
    }
  )
}

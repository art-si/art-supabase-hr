<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="experience-action-dialog">
      <ArtEntitySummary
        icon="ri:route-line"
        eyebrow="AGGREGATE INSIGHT TO ACTION"
        title="把主题洞察转成可验收的组织行动"
        description="行动只关联达到匿名阈值的聚合主题，不建立与个人答案的任何引用。"
      >
        <template #aside>
          <ElTag type="success" effect="light" round>
            <ArtSvgIcon icon="ri:user-follow-line" />负责人 + 期限 + 成功标准
          </ElTag>
        </template>
      </ArtEntitySummary>

      <ArtAsyncState
        :error="optionError"
        error-title="行动所需资料加载失败"
        :min-height="240"
        @retry="retryOptions"
      >
        <ArtForm
          ref="formRef"
          v-model="form.model"
          :items="hrTenantScopedFormItems(form.items, Boolean(form.model.id) || parentTenantLocked)"
          :rules="form.rules"
          :span="12"
          :gutter="22"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #ownerEmployeeId>
            <ArtEmployeeSelect
              v-model="form.model.ownerEmployeeId"
              v-model:selected-data="ownerSelection"
              :tenant-id="form.model.tenantId"
              title="选择改善行动负责人"
              subtitle="负责人承担执行、进度维护与成果验收"
              placeholder="请选择行动负责人"
            />
          </template>
        </ArtForm>
      </ArtAsyncState>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { hrTenantScopedFormItems } from '@hr/views/shared/hr-tenant-scoped-form-items'
  import { employeeReferenceSelection } from '@/utils/form/employee-reference'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { loadAllDocumentPages } from '@/utils/business/document-detail-list'
  import { toTenantSelectOptions } from '@/utils/tenant-display'
  import dayjs from 'dayjs'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import {
    fetchEmployeeExperienceRecords,
    fetchHrOrganizationTree,
    saveEmployeeExperienceRecord
  } from '@hr/api'
  import type { DialogType } from '@/types'
  import {
    hrOrganizationTreeField,
    toHrOrganizationTreeOptions
  } from '../../../shared/hr-organization-tree-field'

  interface OpenPayload {
    type: DialogType
    editData?: Api.Hr.EmployeeExperienceAction
    presetSurvey?: Api.Hr.EmployeeExperienceReference
    presetDimension?: string
  }
  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [type: DialogType] }>()
  const userStore = useUserStore()
  const { getDictMap, getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<ArtFormExpose>()
  const dialogType = ref<DialogType>('add')
  const parentTenantLocked = ref(false)
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const surveys = ref<Api.Hr.EmployeeExperienceSurvey[]>([])
  const organizationOptions = ref<ReturnType<typeof toHrOrganizationTreeOptions>>([])
  const ownerSelection = ref<EmployeeIntegrationItem[]>([])
  const optionError = shallowRef<Error | null>(null)
  let openGeneration = 0
  let optionsRequest = 0
  let tenantRequest = 0
  let surveyRequest = 0

  const createInitialModel = (): Api.Hr.EmployeeExperienceAction => ({
    id: undefined,
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    surveyId: '',
    organizationId: null,
    dimension: 'engagement',
    title: '',
    ownerEmployeeId: '',
    dueDate: dayjs().add(30, 'day').format('YYYY-MM-DD'),
    status: 'planned',
    successMeasure: '',
    progressNote: ''
  })
  const formModel = reactive<Api.Hr.EmployeeExperienceAction>(createInitialModel())
  const dictOptions = (code: string) => getDictMap.value[code] ?? []
  const surveyOptions = computed(() =>
    surveys.value
      .filter((survey) => !formModel.tenantId || survey.tenantId === formModel.tenantId)
      .map((survey) => ({
        label: `${survey.surveyName}（${survey.surveyCode}）`,
        value: survey.id!
      }))
  )
  const selectedSurvey = computed(() =>
    surveys.value.find((survey) => survey.id === formModel.surveyId)
  )
  const formItems = computed<FormItem[]>(() => {
    const items: FormItem[] = []
    if (isPlatformSuper.value) {
      items.push({
        label: '所属租户',
        key: 'tenantId',
        type: 'select',
        span: 24,
        options: tenantOptions.value,
        props: {
          filterable: true,
          disabled: Boolean(formModel.id),
          placeholder: '请选择行动所属租户',
          onChange: async () => {
            formModel.surveyId = ''
            formModel.organizationId = null
            formModel.ownerEmployeeId = ''
            ownerSelection.value = []
            await retryOptions()
          }
        }
      })
    }
    items.push(
      { label: '洞察来源', key: 'source', type: 'divider', span: 24 },
      {
        label: '关联调查',
        key: 'surveyId',
        type: 'select',
        span: 24,
        options: surveyOptions.value,
        props: {
          filterable: true,
          disabled: Boolean(formModel.id),
          placeholder: '请选择收集中或已关闭的调查',
          onChange: (value: string) => {
            const survey = surveys.value.find((item) => item.id === value)
            if (survey?.tenantId && survey.tenantId !== formModel.tenantId) {
              formModel.tenantId = survey.tenantId
              formModel.organizationId = null
              formModel.ownerEmployeeId = ''
              ownerSelection.value = []
              void retryOptions()
            }
          }
        },
        help: selectedSurvey.value
          ? `${selectedSurvey.value.status === 'open' ? '正在收集' : '已关闭'} · 匿名阈值 ${selectedSurvey.value.minimumGroupSize} 人`
          : '行动必须关联收集中或已关闭的员工体验调查'
      },
      {
        label: '改善主题',
        key: 'dimension',
        type: 'select',
        options: dictOptions('hrExperienceDimension')
      },
      hrOrganizationTreeField({
        key: 'organizationId',
        label: '行动组织',
        options: organizationOptions.value,
        placeholder: '可选：不选表示全组织行动'
      }),
      { label: '责任与期限', key: 'accountability', type: 'divider', span: 24 },
      { label: '行动负责人', key: 'ownerEmployeeId', type: 'input' },
      {
        label: '计划完成日',
        key: 'dueDate',
        type: 'date',
        props: { class: '!w-full', valueFormat: 'YYYY-MM-DD' }
      },
      {
        label: '行动名称',
        key: 'title',
        type: 'input',
        span: 24,
        props: {
          maxlength: 160,
          showWordLimit: true,
          placeholder: '用动词开头，明确要改变的组织实践'
        }
      },
      {
        label: '成功标准',
        key: 'successMeasure',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 4,
          maxlength: 1000,
          showWordLimit: true,
          placeholder: '定义可以验收的结果、覆盖范围或下一轮调查目标'
        }
      },
      {
        label: '当前进展',
        key: 'progressNote',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 3,
          maxlength: 1000,
          showWordLimit: true,
          placeholder: '可选：记录当前计划、依赖和阶段性进展'
        }
      }
    )
    return items
  })
  const form = reactive<{
    model: Api.Hr.EmployeeExperienceAction
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<Api.Hr.EmployeeExperienceAction>>
  }>({
    model: formModel,
    items: formItems,
    rules: computed(() => ({
      tenantId: isPlatformSuper.value
        ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
        : [],
      surveyId: [{ required: true, message: '请选择关联调查', trigger: 'change' }],
      dimension: [{ required: true, message: '请选择改善主题', trigger: 'change' }],
      title: [{ required: true, message: '请输入行动名称', trigger: 'blur' }],
      ownerEmployeeId: [{ required: true, message: '请选择行动负责人', trigger: 'change' }],
      dueDate: [{ required: true, message: '请选择计划完成日', trigger: 'change' }],
      successMeasure: [{ required: true, message: '请输入成功标准', trigger: 'blur' }]
    }))
  })

  const loadTenants = async (): Promise<void> => {
    if (!isPlatformSuper.value || tenantOptions.value.length) return
    const request = ++tenantRequest
    const generation = openGeneration
    const response = await fetchEnabledTenantList()
    if (request !== tenantRequest || generation !== openGeneration) return
    if (response.error) {
      optionError.value = new Error('租户选项加载失败，请重新加载', { cause: response.error })
      return
    }
    tenantOptions.value = toTenantSelectOptions(
      (response.data ?? []).filter((tenant): tenant is typeof tenant & { id: string } =>
        Boolean(tenant.id)
      )
    )
  }
  const loadSurveys = async (): Promise<void> => {
    const request = ++surveyRequest
    const generation = openGeneration
    const tenantId = formModel.tenantId
    surveys.value = []
    if (!tenantId) return
    try {
      const rows = await loadAllDocumentPages<
        Api.Hr.EmployeeExperienceSurvey,
        { tenantId: string; from?: number; to?: number }
      >((params) => fetchEmployeeExperienceRecords('survey', params), { tenantId }, 200)
      if (
        request !== surveyRequest ||
        generation !== openGeneration ||
        tenantId !== formModel.tenantId
      )
        return
      surveys.value = rows.filter((survey) => ['open', 'closed'].includes(survey.status))
    } catch (cause) {
      if (
        request === surveyRequest &&
        generation === openGeneration &&
        tenantId === formModel.tenantId
      )
        optionError.value = new Error('关联调查加载失败，请重新加载', { cause })
    }
  }
  let organizationRequest = 0
  const loadOrganizations = async (): Promise<void> => {
    const request = ++organizationRequest
    const generation = openGeneration
    const tenantId = formModel.tenantId
    organizationOptions.value = []
    if (!tenantId) return
    const response = await fetchHrOrganizationTree('experience', { tenantId })
    if (
      request !== organizationRequest ||
      generation !== openGeneration ||
      tenantId !== formModel.tenantId
    )
      return
    if (response.error) {
      optionError.value = new Error('组织选项加载失败，请重新加载', { cause: response.error })
      return
    }
    organizationOptions.value = toHrOrganizationTreeOptions(response.data ?? [])
  }
  const retryOptions = async (): Promise<void> => {
    const generation = openGeneration
    const request = ++optionsRequest
    optionError.value = null
    dialogRef.value?.setLoading(true)
    try {
      await Promise.all([loadTenants(), loadSurveys(), loadOrganizations()])
    } catch (cause) {
      if (generation === openGeneration && request === optionsRequest)
        optionError.value = new Error('行动所需资料加载失败，请重新加载', { cause })
    } finally {
      if (generation === openGeneration && request === optionsRequest)
        dialogRef.value?.setLoading(false)
    }
  }
  watch(optionError, (error) => {
    dialogRef.value?.setOptions({ confirmDisabled: Boolean(error) })
  })
  const submit = async (): Promise<boolean> => {
    const generation = openGeneration
    const type = dialogType.value
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (generation !== openGeneration) return false
      if (dayjs(formModel.dueDate).isBefore(dayjs(), 'day')) {
        ElMessage.warning('计划完成日不能早于今天')
        return false
      }
      await saveEmployeeExperienceRecord('action', {
        ...formModel,
        title: formModel.title.trim(),
        successMeasure: formModel.successMeasure.trim(),
        progressNote: normalizeNullableText(formModel.progressNote)
      })
      emit('success', type)
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }
  const handleOpen = async (payload: OpenPayload): Promise<void> => {
    const generation = ++openGeneration
    optionError.value = null
    parentTenantLocked.value = Boolean(payload.presetSurvey)
    tenantRequest += 1
    surveyRequest += 1
    organizationRequest += 1
    dialogType.value = payload.type
    Object.assign(formModel, createInitialModel(), payload.editData ?? {})
    if (payload.presetSurvey) {
      formModel.tenantId = payload.presetSurvey.tenantId
      formModel.surveyId = payload.presetSurvey.id
    }
    if (payload.presetDimension) formModel.dimension = payload.presetDimension
    ownerSelection.value = employeeReferenceSelection(
      payload.editData?.ownerEmployee,
      formModel.tenantId
    )
    await nextTick()
    if (generation !== openGeneration) return
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(undefined, {
      title: `${payload.type === 'add' ? '新增' : '编辑'}员工体验改善行动`,
      subtitle: '行动从匿名聚合主题出发，不连接任何员工个人答卷',
      confirmText: payload.type === 'add' ? '创建行动' : '保存行动',
      contentMaxHeight: 'calc(100vh - 184px)',
      onOpen: async () => {
        await retryOptions()
        if (
          generation === openGeneration &&
          !optionError.value &&
          payload.presetSurvey &&
          !surveys.value.some((item) => item.id === payload.presetSurvey?.id)
        ) {
          surveys.value.unshift({
            ...createSurveyFallback(payload.presetSurvey),
            status: 'open'
          })
        }
      },
      onClose: () => {
        openGeneration += 1
        tenantRequest += 1
        surveyRequest += 1
        organizationRequest += 1
      },
      onConfirm: async (_data, api) => {
        const confirmGeneration = openGeneration
        api.setLoading(true)
        try {
          return await submit()
        } finally {
          if (confirmGeneration === openGeneration) api.setLoading(false)
        }
      }
    })
  }

  const createSurveyFallback = (
    reference: Api.Hr.EmployeeExperienceReference
  ): Api.Hr.EmployeeExperienceSurvey => ({
    id: reference.id,
    tenantId: reference.tenantId,
    surveyCode: reference.surveyCode || '',
    surveyName: reference.surveyName || '员工体验调查',
    surveyType: reference.surveyType || 'ad_hoc',
    cadence: 'one_time',
    audienceType: 'all_active',
    minimumGroupSize: 5,
    startDate: dayjs().format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD'),
    status: 'open'
  })

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .experience-action-dialog {
    display: grid;
    gap: 18px;
  }
</style>

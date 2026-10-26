<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="experience-survey-dialog">
      <ArtEntitySummary
        icon="ri:survey-line"
        eyebrow="TRUSTED SURVEY DESIGN"
        title="调查边界先于题目发布"
        description="先定义受众、周期与匿名阈值；发布后系统固化参与名单，调查设置不再允许修改。"
      >
        <template #aside>
          <ElTag type="success" effect="light" round>
            <ArtSvgIcon icon="ri:shield-check-line" />最低 5 人成组
          </ElTag>
        </template>
      </ArtEntitySummary>

      <ArtAsyncState
        :error="optionError"
        error-title="调查所需资料加载失败"
        :min-height="240"
        @retry="retryOptions"
      >
        <ArtForm
          ref="formRef"
          v-model="form.model"
          :items="hrTenantScopedFormItems(form.items, Boolean(form.model.id))"
          :rules="form.rules"
          :span="12"
          :gutter="22"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        />
      </ArtAsyncState>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { hrTenantScopedFormItems } from '@hr/views/shared/hr-tenant-scoped-form-items'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import dayjs from 'dayjs'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import { fetchHrOrganizationTree, saveEmployeeExperienceRecord } from '@hr/api'
  import {
    hrOrganizationTreeField,
    toHrOrganizationTreeOptions
  } from '../../../shared/hr-organization-tree-field'
  import type { DialogType } from '@/types'

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
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const organizationOptions = ref<ReturnType<typeof toHrOrganizationTreeOptions>>([])
  const optionError = shallowRef<Error | null>(null)
  let openGeneration = 0
  let tenantRequest = 0

  const createInitialModel = (): Api.Hr.EmployeeExperienceSurvey => ({
    id: undefined,
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    surveyCode: '',
    surveyName: '',
    surveyType: 'pulse',
    cadence: 'one_time',
    audienceType: 'all_active',
    audienceOrganizationId: null,
    minimumGroupSize: 5,
    startDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
    endDate: dayjs().add(14, 'day').format('YYYY-MM-DD'),
    status: 'draft',
    description: ''
  })
  const formModel = reactive<Api.Hr.EmployeeExperienceSurvey>(createInitialModel())
  const dictOptions = (code: string) => getDictMap.value[code] ?? []

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
          placeholder: '请选择调查所属租户',
          onChange: async () => {
            formModel.audienceOrganizationId = null
            await retryOptions()
          }
        }
      })
    }
    items.push(
      { label: '调查识别', key: 'identity', type: 'divider', span: 24 },
      {
        label: '调查编码',
        key: 'surveyCode',
        type: 'input',
        props: {
          maxlength: 40,
          placeholder: '例如 ENGAGEMENT-2027-Q1',
          disabled: dialogType.value === 'edit'
        },
        help: '编码用于跨周期追踪，同一租户内不可重复'
      },
      {
        label: '调查名称',
        key: 'surveyName',
        type: 'input',
        props: { maxlength: 120, showWordLimit: true, placeholder: '输入员工可理解的调查名称' }
      },
      {
        label: '调查类型',
        key: 'surveyType',
        type: 'select',
        options: dictOptions('hrExperienceSurveyType')
      },
      {
        label: '开展频率',
        key: 'cadence',
        type: 'select',
        options: dictOptions('hrExperienceCadence')
      },
      { label: '覆盖与匿名保护', key: 'audience', type: 'divider', span: 24 },
      {
        label: '覆盖方式',
        key: 'audienceType',
        type: 'select',
        options: dictOptions('hrExperienceAudienceType'),
        props: {
          onChange: (value: string) => {
            if (value === 'all_active') formModel.audienceOrganizationId = null
          }
        },
        help: '发布时按当日有效任职快照固化参与人员'
      },
      {
        ...hrOrganizationTreeField({
          key: 'audienceOrganizationId',
          label: '目标组织',
          options: organizationOptions.value
        }),
        hidden: () => formModel.audienceType !== 'organization'
      },
      {
        label: '最小匿名阈值',
        key: 'minimumGroupSize',
        type: 'number',
        props: { min: 5, max: 50, controlsPosition: 'right', class: '!w-full' },
        help: '任何主题或组织样本低于此人数时均不返回结果'
      },
      { label: '开放周期', key: 'period', type: 'divider', span: 24 },
      {
        label: '开始日期',
        key: 'startDate',
        type: 'date',
        props: { class: '!w-full', valueFormat: 'YYYY-MM-DD' }
      },
      {
        label: '结束日期',
        key: 'endDate',
        type: 'date',
        props: { class: '!w-full', valueFormat: 'YYYY-MM-DD' }
      },
      {
        label: '调查说明',
        key: 'description',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 4,
          maxlength: 1000,
          showWordLimit: true,
          placeholder: '向员工说明调查目的、预计用时与匿名保护方式'
        }
      }
    )
    return items
  })

  const form = reactive<{
    model: Api.Hr.EmployeeExperienceSurvey
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<Api.Hr.EmployeeExperienceSurvey>>
  }>({
    model: formModel,
    items: formItems,
    rules: computed(() => ({
      tenantId: isPlatformSuper.value
        ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
        : [],
      surveyCode: [{ required: true, message: '请输入调查编码', trigger: 'blur' }],
      surveyName: [{ required: true, message: '请输入调查名称', trigger: 'blur' }],
      surveyType: [{ required: true, message: '请选择调查类型', trigger: 'change' }],
      cadence: [{ required: true, message: '请选择开展频率', trigger: 'change' }],
      audienceType: [{ required: true, message: '请选择覆盖方式', trigger: 'change' }],
      audienceOrganizationId:
        formModel.audienceType === 'organization'
          ? [{ required: true, message: '请选择目标组织', trigger: 'change' }]
          : [],
      minimumGroupSize: [{ required: true, message: '请输入匿名阈值', trigger: 'change' }],
      startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
      endDate: [{ required: true, message: '请选择结束日期', trigger: 'change' }]
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
    tenantOptions.value = (response.data ?? []).map((tenant) => ({
      label: `${tenant.tenantName}（${tenant.tenantCode}）`,
      value: tenant.id!
    }))
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
    optionError.value = null
    dialogRef.value?.setLoading(true)
    try {
      await Promise.all([loadTenants(), loadOrganizations()])
    } finally {
      if (generation === openGeneration) dialogRef.value?.setLoading(false)
    }
  }
  watch(optionError, (error) => {
    dialogRef.value?.setOptions({ confirmDisabled: Boolean(error) })
  })
  const submit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (formModel.audienceType === 'organization' && !formModel.audienceOrganizationId) {
        ElMessage.warning('组织定向调查需要选择目标组织')
        return false
      }
      if (dayjs(formModel.endDate).isBefore(dayjs(formModel.startDate), 'day')) {
        ElMessage.warning('结束日期不能早于开始日期')
        return false
      }
      await saveEmployeeExperienceRecord('survey', {
        ...formModel,
        surveyCode: formModel.surveyCode.trim().toUpperCase(),
        surveyName: formModel.surveyName.trim(),
        audienceOrganizationId:
          formModel.audienceType === 'organization' ? formModel.audienceOrganizationId : null,
        description: normalizeNullableText(formModel.description)
      })
      emit('success', dialogType.value)
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (
    type: DialogType,
    editData?: Api.Hr.EmployeeExperienceSurvey
  ): Promise<void> => {
    const generation = ++openGeneration
    optionError.value = null
    tenantRequest += 1
    organizationRequest += 1
    dialogType.value = type
    Object.assign(formModel, createInitialModel(), editData ?? {})
    await nextTick()
    if (generation !== openGeneration) return
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(undefined, {
      title: `${type === 'add' ? '新建' : '编辑'}员工体验调查`,
      subtitle: '调查发布前可维护配置与题目，发布后设置与受众快照冻结',
      confirmText: type === 'add' ? '创建草稿' : '保存设置',
      contentMaxHeight: 'calc(100vh - 184px)',
      onOpen: async () => retryOptions(),
      onClose: () => {
        openGeneration += 1
        tenantRequest += 1
        organizationRequest += 1
      },
      onConfirm: async (_data, api) => {
        api.setLoading(true)
        try {
          return await submit()
        } finally {
          api.setLoading(false)
        }
      }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .experience-survey-dialog {
    display: grid;
    gap: 18px;
  }
</style>

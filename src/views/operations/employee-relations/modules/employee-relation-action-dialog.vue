<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="employee-relation-action-dialog">
      <div class="employee-relation-action-dialog__case">
        <span aria-hidden="true"><ArtSvgIcon :icon="actionMeta.icon" /></span>
        <div>
          <small>{{ record?.caseNo }}</small>
          <strong>{{ record?.title }}</strong>
          <p>{{ actionMeta.description }}</p>
        </div>
      </div>

      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="form.items"
        :rules="form.rules"
        :span="12"
        :gutter="20"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #ownerEmployeeId>
          <ArtEmployeeSelect
            v-model="form.model.ownerEmployeeId"
            v-model:selected-data="ownerSelection"
            :tenant-id="record?.tenantId"
            title="选择案件负责人"
            subtitle="负责人承担调查推进、期限控制和结案材料完整性"
            placeholder="请选择案件负责人"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { employeeReferenceSelection } from '@/utils/form/employee-reference'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import dayjs from 'dayjs'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { useUserStore } from '@/store/modules/user'
  import { fetchEmployeeRelationCaseDetail, transitionEmployeeRelationCase } from '@hr/api'

  type ManagedAction = Extract<
    Api.Hr.EmployeeRelationCaseAction,
    'triage' | 'require_action' | 'resolve'
  >

  interface FormModel {
    ownerEmployeeId?: string
    targetResolutionDate: string
    severity: string
    confidentialityLevel: string
    findingsSummary: string
    outcome: string
    resolutionSummary: string
    comment: string
  }

  interface ActionMeta {
    title: string
    confirmText: string
    icon: string
    description: string
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<ArtFormExpose>()
  const action = ref<ManagedAction>('triage')
  const record = shallowRef<Api.Hr.EmployeeRelationCase>()
  const ownerSelection = ref<EmployeeIntegrationItem[]>([])

  const createInitialModel = (): FormModel => ({
    ownerEmployeeId: undefined,
    targetResolutionDate: dayjs().add(14, 'day').format('YYYY-MM-DD'),
    severity: 'medium',
    confidentialityLevel: 'restricted',
    findingsSummary: '',
    outcome: '',
    resolutionSummary: '',
    comment: ''
  })
  const formModel = reactive<FormModel>(createInitialModel())

  const actionMetas: Record<ManagedAction, ActionMeta> = {
    triage: {
      title: '分派与分级案件',
      confirmText: '完成分级',
      icon: 'ri:user-settings-line',
      description: '明确唯一负责人、保密等级和目标解决日期，案件随后进入可控调查队列。'
    },
    require_action: {
      title: '提交调查发现',
      confirmText: '进入处置阶段',
      icon: 'ri:search-eye-line',
      description: '固化已核验的事实发现，再通过独立处置行动落实责任人与期限。'
    },
    resolve: {
      title: '提交案件解决结论',
      confirmText: '确认解决',
      icon: 'ri:checkbox-circle-line',
      description: '仅在所有处置行动完成后提交结论；正式结案仍由下一步独立确认。'
    }
  }
  const actionMeta = computed(() => actionMetas[action.value])

  const formItems = computed<FormItem[]>(() => {
    if (action.value === 'triage') {
      return [
        { label: '案件负责人', key: 'ownerEmployeeId', type: 'input', span: 24 },
        {
          label: '严重程度',
          key: 'severity',
          type: 'select',
          options: getDictMap.value.hrEmployeeRelationSeverity ?? []
        },
        {
          label: '保密等级',
          key: 'confidentialityLevel',
          type: 'select',
          options: getDictMap.value.hrEmployeeRelationConfidentiality ?? []
        },
        {
          label: '目标解决日期',
          key: 'targetResolutionDate',
          type: 'date',
          span: 24,
          props: { class: '!w-full' }
        },
        commentItem('分级说明', false)
      ]
    }
    if (action.value === 'require_action') {
      return [
        {
          label: '调查发现',
          key: 'findingsSummary',
          type: 'input',
          span: 24,
          props: {
            type: 'textarea',
            rows: 6,
            maxlength: 2000,
            showWordLimit: true,
            placeholder: '记录已经核验的事实、证据范围和仍存在的不确定性'
          }
        },
        commentItem('阶段说明', false)
      ]
    }
    return [
      {
        label: '案件结论',
        key: 'outcome',
        type: 'select',
        span: 24,
        options: getDictMap.value.hrEmployeeRelationOutcome ?? []
      },
      {
        label: '调查发现',
        key: 'findingsSummary',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 4,
          maxlength: 2000,
          showWordLimit: true,
          placeholder: '可补充或修正最终确认的调查发现'
        }
      },
      {
        label: '解决摘要',
        key: 'resolutionSummary',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 5,
          maxlength: 2000,
          showWordLimit: true,
          placeholder: '说明结论、已完成行动、后续观察或升级安排'
        }
      },
      commentItem('解决说明', false)
    ]
  })

  const commentItem = (label: string, required: boolean): FormItem => ({
    label,
    key: 'comment',
    type: 'input',
    span: 24,
    props: {
      type: 'textarea',
      rows: 3,
      maxlength: 300,
      showWordLimit: true,
      placeholder: required ? `请填写${label}` : `可选：填写${label}`
    }
  })

  const form = reactive<{
    model: FormModel
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<FormModel>>
  }>({
    model: formModel,
    items: formItems,
    rules: computed(() => ({
      ownerEmployeeId:
        action.value === 'triage'
          ? [{ required: true, message: '请选择案件负责人', trigger: 'change' }]
          : [],
      targetResolutionDate:
        action.value === 'triage'
          ? [{ required: true, message: '请选择目标解决日期', trigger: 'change' }]
          : [],
      severity:
        action.value === 'triage'
          ? [{ required: true, message: '请选择严重程度', trigger: 'change' }]
          : [],
      confidentialityLevel:
        action.value === 'triage'
          ? [{ required: true, message: '请选择保密等级', trigger: 'change' }]
          : [],
      findingsSummary:
        action.value === 'require_action'
          ? [{ required: true, message: '请填写调查发现', trigger: 'blur' }]
          : [],
      outcome:
        action.value === 'resolve'
          ? [{ required: true, message: '请选择案件结论', trigger: 'change' }]
          : [],
      resolutionSummary:
        action.value === 'resolve'
          ? [{ required: true, message: '请填写解决摘要', trigger: 'blur' }]
          : []
    }))
  })

  const applyRecord = (target: Api.Hr.EmployeeRelationCase): void => {
    record.value = target
    Object.assign(formModel, {
      ownerEmployeeId: target.ownerEmployeeId || undefined,
      targetResolutionDate:
        target.targetResolutionDate || dayjs().add(14, 'day').format('YYYY-MM-DD'),
      severity: target.severity,
      confidentialityLevel: target.confidentialityLevel,
      findingsSummary: target.findingsSummary || ''
    })
    ownerSelection.value = employeeReferenceSelection(target.ownerEmployee, target.tenantId)
  }

  const submit = async (): Promise<boolean> => {
    if (!record.value?.id) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (
        action.value === 'triage' &&
        dayjs(formModel.targetResolutionDate).isBefore(dayjs(), 'day')
      ) {
        ElMessage.warning('目标解决日期不能早于今天')
        return false
      }
      await transitionEmployeeRelationCase(record.value.id, action.value, {
        ownerEmployeeId: formModel.ownerEmployeeId,
        targetResolutionDate: formModel.targetResolutionDate,
        severity: formModel.severity,
        confidentialityLevel: formModel.confidentialityLevel,
        findingsSummary: formModel.findingsSummary.trim() || undefined,
        outcome: formModel.outcome || undefined,
        resolutionSummary: formModel.resolutionSummary.trim() || undefined,
        comment: formModel.comment.trim() || undefined
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (
    targetAction: ManagedAction,
    targetRecord: Api.Hr.EmployeeRelationCase
  ): Promise<void> => {
    action.value = targetAction
    record.value = targetRecord
    Object.assign(formModel, createInitialModel(), {
      severity: targetRecord.severity,
      confidentialityLevel: targetRecord.confidentialityLevel
    })
    ownerSelection.value = []
    applyRecord(targetRecord)
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(undefined, {
      title: actionMeta.value.title,
      subtitle: `${targetRecord.caseNo} · 受控员工关系案件`,
      confirmText: actionMeta.value.confirmText,
      contentMaxHeight: 'calc(100vh - 184px)',
      onOpen: async (_data, api) => {
        api.setLoading(true)
        try {
          if (targetRecord.id) {
            const response = await fetchEmployeeRelationCaseDetail(targetRecord.id)
            if (response.data) applyRecord(response.data)
          }
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: submit
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .employee-relation-action-dialog {
    display: grid;
    gap: 18px;
    min-width: 0;

    &__case {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: 13px;
      align-items: center;
      padding: 14px 16px;
      background: color-mix(in srgb, var(--theme-color) 6%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 16%, var(--art-card-border));
      border-radius: var(--art-surface-radius);

      > span {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 11%, transparent);
        border-radius: var(--el-border-radius-base);
      }

      div {
        display: grid;
        min-width: 0;
      }

      small {
        font-size: 11px;
        color: var(--theme-color);
      }

      strong {
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      p {
        margin: 4px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--el-text-color-secondary);
      }
    }
  }
</style>

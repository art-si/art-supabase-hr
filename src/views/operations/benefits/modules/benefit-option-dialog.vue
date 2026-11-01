<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="benefit-option-dialog">
      <ArtEntitySummary
        icon="ri:stack-line"
        eyebrow="COVERAGE OPTION"
        :title="plan?.planName || '福利覆盖方案'"
        description="方案固化覆盖层级与缴费规则；员工参保时复制金额快照，后续调价不会改写历史记录。"
      />
      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="form.items"
        :rules="form.rules"
        :span="12"
        :gutter="22"
        label-position="top"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { toNameCodeOption } from '@/utils/form/option'

  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { fetchCompensationOptions, saveBenefitRecord } from '@hr/api'
  import type { DialogType } from '@/types'

  interface OpenPayload {
    type: DialogType
    plan: Api.Hr.BenefitPlan
    editData?: Api.Hr.BenefitOption
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
  const dialogType = ref<DialogType>('add')
  const plan = shallowRef<Api.Hr.BenefitPlan>()
  const componentOptions = ref<Api.Hr.CompensationReference[]>([])

  const createInitialModel = (): Api.Hr.BenefitOption => ({
    id: undefined,
    tenantId: undefined,
    planId: '',
    optionCode: '',
    optionName: '',
    coverageLevel: 'employee',
    contributionType: 'fixed',
    employeeContribution: 0,
    employerContribution: 0,
    employeeRate: null,
    employerRate: null,
    payComponentId: null,
    enabled: true,
    sort: 0,
    description: null
  })

  const formModel = reactive<Api.Hr.BenefitOption>(createInitialModel())
  const form = reactive<{
    model: Api.Hr.BenefitOption
    items: ComputedRef<FormItem[]>
    rules: FormRules<Api.Hr.BenefitOption>
  }>({
    model: formModel,
    items: computed((): FormItem[] => [
      { label: '方案识别', key: 'identity', type: 'divider', span: 24 },
      {
        label: '方案编码',
        key: 'optionCode',
        type: 'input',
        props: { maxlength: 40, placeholder: '例如 FAMILY-A' }
      },
      {
        label: '方案名称',
        key: 'optionName',
        type: 'input',
        props: { maxlength: 120, placeholder: '例如 家庭综合保障' }
      },
      {
        label: '覆盖层级',
        key: 'coverageLevel',
        type: 'select',
        options: getDictMap.value.hrBenefitCoverageLevel ?? []
      },
      {
        label: '缴费方式',
        key: 'contributionType',
        type: 'select',
        options: getDictMap.value.hrBenefitContributionType ?? []
      },
      { label: '缴费规则', key: 'contribution', type: 'divider', span: 24 },
      {
        label: formModel.contributionType === 'fixed' ? '员工月缴费' : '员工工资比例',
        key: formModel.contributionType === 'fixed' ? 'employeeContribution' : 'employeeRate',
        type: 'number',
        props: {
          min: 0,
          precision: formModel.contributionType === 'fixed' ? 2 : 6,
          class: '!w-full'
        }
      },
      {
        label: formModel.contributionType === 'fixed' ? '雇主月缴费' : '雇主工资比例',
        key: formModel.contributionType === 'fixed' ? 'employerContribution' : 'employerRate',
        type: 'number',
        props: {
          min: 0,
          precision: formModel.contributionType === 'fixed' ? 2 : 6,
          class: '!w-full'
        }
      },
      {
        label: '薪资扣款项目',
        key: 'payComponentId',
        type: 'select',
        options: componentOptions.value.map(toNameCodeOption),
        props: { clearable: true, filterable: true, placeholder: '可选：映射到标准薪资项目' },
        help: '只建立受控输入映射，不直接执行薪资计算或财务记账'
      },
      { label: '启用状态', key: 'enabled', type: 'switch' },
      { label: '排序', key: 'sort', type: 'number', props: { min: 0, class: '!w-full' } },
      {
        label: '方案说明',
        key: 'description',
        type: 'input',
        span: 24,
        props: { type: 'textarea', rows: 3, maxlength: 600, showWordLimit: true }
      }
    ]),
    rules: {
      optionCode: [{ required: true, message: '请输入方案编码', trigger: 'blur' }],
      optionName: [{ required: true, message: '请输入方案名称', trigger: 'blur' }],
      coverageLevel: [{ required: true, message: '请选择覆盖层级', trigger: 'change' }],
      contributionType: [{ required: true, message: '请选择缴费方式', trigger: 'change' }]
    }
  })

  const toRecord = (): Api.Hr.BenefitOption => ({
    ...toRaw(formModel),
    optionCode: formModel.optionCode.trim(),
    optionName: formModel.optionName.trim(),
    employeeContribution:
      formModel.contributionType === 'fixed' ? formModel.employeeContribution || 0 : 0,
    employerContribution:
      formModel.contributionType === 'fixed' ? formModel.employerContribution || 0 : 0,
    employeeRate: formModel.contributionType === 'salary_rate' ? formModel.employeeRate || 0 : null,
    employerRate: formModel.contributionType === 'salary_rate' ? formModel.employerRate || 0 : null,
    payComponentId: formModel.payComponentId || null,
    description: normalizeNullableText(formModel.description)
  })

  const submit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      await saveBenefitRecord('option', toRecord())
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (payload: OpenPayload): Promise<void> => {
    dialogType.value = payload.type
    plan.value = payload.plan
    Object.assign(formModel, createInitialModel(), payload.editData ?? {}, {
      tenantId: payload.plan.tenantId,
      planId: payload.plan.id
    })
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(undefined, {
      title: `${payload.type === 'add' ? '新增' : '编辑'}福利覆盖方案`,
      subtitle: `${payload.plan.planCode} · ${payload.plan.planName}`,
      confirmText: payload.type === 'add' ? '创建方案' : '保存更改',
      contentMaxHeight: 'calc(100vh - 184px)',
      onOpen: async (_data, api) => {
        api.setLoading(true)
        try {
          const response = await fetchCompensationOptions('component', payload.plan.tenantId)
          componentOptions.value = response.data ?? []
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
  .benefit-option-dialog {
    display: grid;
    gap: 18px;
    min-width: 0;
  }
</style>

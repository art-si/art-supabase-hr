<template>
  <ArtDialog ref="dialogRef" size="md">
    <ArtForm
      ref="formRef"
      v-model="form.model"
      :items="hrTenantScopedFormItems(form.items, Boolean(form.model.id))"
      :rules="form.rules"
      :span="12"
      :gutter="24"
      label-position="top"
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import { hrTenantScopedFormItems } from '@hr/views/shared/hr-tenant-scoped-form-items'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, {
    type FormItem,
    type FormItemOption
  } from '@/components/core/forms/art-form/index.vue'
  import { fetchEnabledTenantList } from '@/api/system-manage'
  import { fetchJobArchitectureOptions, saveJobArchitectureRecord } from '@hr/api'
  import { useUserStore } from '@/store/modules/user'
  import type { DialogType } from '@/types'

  type Entity = Api.Hr.JobArchitectureEntity
  type RecordItem = Api.Hr.JobFamily | Api.Hr.Grade | Api.Hr.JobProfile

  interface ArchitectureFormModel {
    id?: string
    tenantId?: string
    familyCode: string
    familyName: string
    gradeCode: string
    gradeName: string
    gradeLevel: number
    jobCode: string
    jobName: string
    familyId?: string
    defaultGradeId?: string | null
    enabled: boolean
    sort: number
    responsibilities?: string | null
    requirements?: string | null
    description?: string | null
  }

  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
    reloadOptions: (key: string) => Promise<void>
  }

  interface FormState {
    model: ArchitectureFormModel
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<ArchitectureFormModel>>
  }

  const emit = defineEmits<{ success: [type: DialogType] }>()
  const userStore = useUserStore()
  const { getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<FormExpose>()
  const entity = ref<Entity>('profile')
  const tenantOptions = ref<FormItemOption[]>([])

  const createInitialModel = (): ArchitectureFormModel => ({
    tenantId: isPlatformSuper.value ? undefined : getUserInfo.value.tenantId,
    familyCode: '',
    familyName: '',
    gradeCode: '',
    gradeName: '',
    gradeLevel: 1,
    jobCode: '',
    jobName: '',
    familyId: undefined,
    defaultGradeId: null,
    enabled: true,
    sort: 0,
    responsibilities: '',
    requirements: '',
    description: ''
  })
  const formModel = reactive<ArchitectureFormModel>(createInitialModel())

  const reloadDependentOptions = async (): Promise<void> => {
    if (entity.value !== 'profile') return
    await Promise.all([
      formRef.value?.reloadOptions('familyId'),
      formRef.value?.reloadOptions('defaultGradeId')
    ])
  }

  const form = reactive<FormState>({
    model: formModel,
    items: computed((): FormItem[] => {
      const common: FormItem[] = [
        {
          label: '所属租户',
          key: 'tenantId',
          type: 'select',
          span: 24,
          hidden: !isPlatformSuper.value,
          options: tenantOptions.value,
          props: {
            filterable: true,
            disabled: Boolean(formModel.id),
            placeholder: '请选择所属租户',
            onChange: () => void reloadDependentOptions()
          }
        },
        {
          label: '排序',
          key: 'sort',
          type: 'number',
          props: { min: 0, max: 9999, controlsPosition: 'right', class: '!w-full' }
        },
        {
          label: '状态',
          key: 'enabled',
          type: 'switch',
          props: { activeText: '启用', inactiveText: '停用', inlinePrompt: true }
        },
        {
          label: '说明',
          key: 'description',
          type: 'input',
          span: 24,
          props: { type: 'textarea', rows: 3, maxlength: 300, showWordLimit: true }
        }
      ]
      if (entity.value === 'family')
        return [
          { label: '职族信息', key: 'section', type: 'divider', span: 24 },
          {
            label: '职族编码',
            key: 'familyCode',
            type: 'input',
            props: { maxlength: 32, placeholder: '如 OPERATIONS' }
          },
          {
            label: '职族名称',
            key: 'familyName',
            type: 'input',
            props: { maxlength: 50, placeholder: '如 运营管理' }
          },
          ...common
        ]
      if (entity.value === 'grade')
        return [
          { label: '职级信息', key: 'section', type: 'divider', span: 24 },
          {
            label: '职级编码',
            key: 'gradeCode',
            type: 'input',
            props: { maxlength: 32, placeholder: '如 P5' }
          },
          {
            label: '职级名称',
            key: 'gradeName',
            type: 'input',
            props: { maxlength: 50, placeholder: '如 资深专员' }
          },
          {
            label: '层级值',
            key: 'gradeLevel',
            type: 'number',
            span: 24,
            props: { min: 1, max: 999, controlsPosition: 'right', class: '!w-full' },
            help: '数值越大表示组织内层级越高，用于晋升和降职校验。'
          },
          ...common
        ]
      return [
        { label: '标准职务信息', key: 'section', type: 'divider', span: 24 },
        {
          label: '职务编码',
          key: 'jobCode',
          type: 'input',
          props: { maxlength: 32, placeholder: '如 DISPATCHER' }
        },
        {
          label: '职务名称',
          key: 'jobName',
          type: 'input',
          props: { maxlength: 50, placeholder: '如 运输调度员' }
        },
        {
          label: '所属职族',
          key: 'familyId',
          type: 'select',
          immediate: false,
          api: async () =>
            (await fetchJobArchitectureOptions('family', formModel.tenantId)).data ?? [],
          valueField: 'id',
          labelFn: (option) => `${option.name ?? ''} · ${option.code ?? ''}`,
          props: { filterable: true, placeholder: '请选择所属职族' }
        },
        {
          label: '默认职级',
          key: 'defaultGradeId',
          type: 'select',
          immediate: false,
          api: async () =>
            (await fetchJobArchitectureOptions('grade', formModel.tenantId)).data ?? [],
          valueField: 'id',
          labelFn: (option) => `${option.name ?? ''} · ${option.code ?? ''}`,
          props: { filterable: true, clearable: true, placeholder: '可选，用于岗位默认值' }
        },
        {
          label: '核心职责',
          key: 'responsibilities',
          type: 'input',
          span: 24,
          props: { type: 'textarea', rows: 3, maxlength: 1000, showWordLimit: true }
        },
        {
          label: '任职要求',
          key: 'requirements',
          type: 'input',
          span: 24,
          props: { type: 'textarea', rows: 3, maxlength: 1000, showWordLimit: true }
        },
        ...common
      ]
    }),
    rules: computed(() => {
      const rules: FormRules<ArchitectureFormModel> = {
        tenantId: isPlatformSuper.value
          ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
          : [],
        sort: [{ required: true, message: '请输入排序值', trigger: 'change' }],
        description: [{ max: 300, message: '说明不能超过 300 个字符', trigger: 'blur' }]
      }
      if (entity.value === 'family')
        Object.assign(rules, {
          familyCode: [{ required: true, message: '请输入职族编码', trigger: 'blur' }],
          familyName: [{ required: true, message: '请输入职族名称', trigger: 'blur' }]
        })
      if (entity.value === 'grade')
        Object.assign(rules, {
          gradeCode: [{ required: true, message: '请输入职级编码', trigger: 'blur' }],
          gradeName: [{ required: true, message: '请输入职级名称', trigger: 'blur' }],
          gradeLevel: [{ required: true, message: '请输入层级值', trigger: 'change' }]
        })
      if (entity.value === 'profile')
        Object.assign(rules, {
          jobCode: [{ required: true, message: '请输入职务编码', trigger: 'blur' }],
          jobName: [{ required: true, message: '请输入职务名称', trigger: 'blur' }],
          familyId: [{ required: true, message: '请选择所属职族', trigger: 'change' }]
        })
      return rules
    })
  })

  const replaceModel = (next: ArchitectureFormModel): void => {
    Object.keys(form.model).forEach((key) => delete form.model[key as keyof ArchitectureFormModel])
    Object.assign(form.model, next)
  }
  const resetForm = async (): Promise<void> => {
    replaceModel(createInitialModel())
    await nextTick()
    formRef.value?.clearValidate()
  }
  const toRecord = (): RecordItem => {
    const common = {
      id: form.model.id,
      tenantId: form.model.tenantId,
      enabled: form.model.enabled,
      sort: form.model.sort,
      description: form.model.description
    }
    if (entity.value === 'family')
      return { ...common, familyCode: form.model.familyCode, familyName: form.model.familyName }
    if (entity.value === 'grade')
      return {
        ...common,
        gradeCode: form.model.gradeCode,
        gradeName: form.model.gradeName,
        gradeLevel: form.model.gradeLevel
      }
    return {
      ...common,
      familyId: form.model.familyId!,
      defaultGradeId: form.model.defaultGradeId,
      jobCode: form.model.jobCode,
      jobName: form.model.jobName,
      responsibilities: form.model.responsibilities,
      requirements: form.model.requirements
    }
  }
  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      const type: DialogType = form.model.id ? 'edit' : 'add'
      await saveJobArchitectureRecord(entity.value, toRecord())
      emit('success', type)
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }
  const handleOpen = async (nextEntity: Entity, row?: RecordItem): Promise<void> => {
    entity.value = nextEntity
    await resetForm()
    if (row)
      replaceModel({
        ...createInitialModel(),
        ...structuredClone(toRaw(row))
      } as ArchitectureFormModel)
    await dialogRef.value?.handleOpen(undefined, {
      title: `${row ? '编辑' : '新增'}${nextEntity === 'profile' ? '标准职务' : nextEntity === 'family' ? '职族' : '职级'}`,
      subtitle:
        nextEntity === 'profile'
          ? '标准职务跨组织复用，岗位必须引用一个标准职务'
          : '维护企业统一的职务分类和晋升层级标准',
      confirmText: row ? '保存更改' : '创建记录',
      contentMaxHeight: 'calc(100vh - 184px)',
      loading: isPlatformSuper.value && !tenantOptions.value.length,
      onOpen: async (_data, api) => {
        api.setLoading(true)
        try {
          if (isPlatformSuper.value && !tenantOptions.value.length) {
            const response = await fetchEnabledTenantList()
            tenantOptions.value = (response.data ?? []).map((tenant) => ({
              label: `${tenant.tenantName}（${tenant.tenantCode}）`,
              value: tenant.id!
            }))
          }
          await reloadDependentOptions()
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit,
      onReset: () => void resetForm()
    })
  }
  defineExpose({ handleOpen })
</script>

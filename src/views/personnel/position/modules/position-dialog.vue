<template>
  <ArtDialog ref="dialogRef" size="md">
    <ArtForm
      ref="formRef"
      class="position-dialog__form"
      v-model="form"
      :items="hrTenantScopedFormItems(formItems, Boolean(form.id))"
      :rules="formRules"
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
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { addPosition, editPosition, fetchJobArchitectureOptions } from '@hr/api'
  import { fetchEnabledOrganizationTree } from '@/api/system-manage'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { useDocumentNumberRule } from '@/hooks/core/useDocumentNumberRule'

  defineOptions({ name: 'HrPositionDialog' })

  type Position = Api.Hr.Position

  interface PositionDialogDefaults {
    organizationId?: string
  }

  interface DialogExposeForm {
    validate: () => Promise<boolean>
    clearValidate: () => void
    reloadOptions: (key: string) => Promise<void>
  }

  const emit = defineEmits<{ (event: 'success', type: 'add' | 'edit'): void }>()
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const dialogRef = ref<ArtDialogExpose<Position | undefined>>()
  const formRef = ref<DialogExposeForm>()

  const createInitialForm = (): Position => ({
    tenantId: defaultWriteTenantId.value ?? undefined,
    organizationId: null,
    jobProfileId: '',
    gradeId: null,
    positionCode: '',
    positionName: '',
    enabled: true,
    headcountLimit: 1,
    multipleIncumbentsAllowed: false,
    sort: 0,
    description: ''
  })
  const form = ref<Position>(createInitialForm())
  const positionNumber = useDocumentNumberRule('hr.position')

  const formRules = computed<FormRules<Position>>(() => ({
    tenantId: [{ required: true, message: '当前账号未绑定有效租户', trigger: 'change' }],
    positionCode: [
      ...(form.value.id || positionNumber.manualRequired(false)
        ? [{ required: true, message: '请输入岗位编码', trigger: 'blur' as const }]
        : []),
      {
        pattern: /^$|^[A-Za-z][A-Za-z0-9_-]{1,31}$/,
        message: '请输入 2-32 位字母开头的编码',
        trigger: 'blur'
      }
    ],
    positionName: [
      { required: true, message: '请输入岗位名称', trigger: 'blur' },
      { min: 2, max: 50, message: '岗位名称应为 2-50 个字符', trigger: 'blur' }
    ],
    organizationId: [{ required: true, message: '请选择所属组织', trigger: 'change' }],
    jobProfileId: [{ required: true, message: '请选择标准职务', trigger: 'change' }],
    headcountLimit: [{ required: true, message: '请输入编制上限', trigger: 'change' }],
    sort: [{ required: true, message: '请输入排序值', trigger: 'change' }],
    description: [{ max: 300, message: '岗位说明不能超过 300 个字符', trigger: 'blur' }]
  }))

  const formItems = computed<FormItem[]>(() => [
    { label: '岗位信息', key: 'baseSection', type: 'divider', span: 24 },
    {
      label: '所属租户',
      key: 'tenantId',
      type: 'input',
      hidden: true
    },
    {
      label: '所属组织',
      key: 'organizationId',
      type: 'treeSelect',
      immediate: false,
      api: async () =>
        (await fetchEnabledOrganizationTree({ tenantId: form.value.tenantId })).data ?? [],
      valueField: 'id',
      labelField: 'organizationName',
      childrenField: 'children',
      labelFn: (option) => `${option.organizationName ?? ''} · ${option.organizationCode ?? ''}`,
      props: {
        filterable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false,
        placeholder: '请选择岗位所属组织'
      },
      description: '按组织树选择岗位归属；保存后可在主列表左侧组织导航中筛选。'
    },
    {
      label: '标准职务',
      key: 'jobProfileId',
      type: 'select',
      immediate: false,
      api: async () =>
        (await fetchJobArchitectureOptions('profile', form.value.tenantId)).data ?? [],
      valueField: 'id',
      labelFn: (option) => `${option.name ?? ''} · ${option.code ?? ''}`,
      props: { filterable: true, placeholder: '请选择岗位对应的标准职务' }
    },
    {
      label: '职级',
      key: 'gradeId',
      type: 'select',
      immediate: false,
      api: async () => (await fetchJobArchitectureOptions('grade', form.value.tenantId)).data ?? [],
      valueField: 'id',
      labelFn: (option) => `${option.name ?? ''} · ${option.code ?? ''}`,
      props: { filterable: true, clearable: true, placeholder: '可选，默认继承标准职务' }
    },
    {
      label: '岗位编码',
      key: 'positionCode',
      type: 'input',
      props: {
        maxlength: 32,
        ...positionNumber.inputProps(Boolean(form.value.id), '如 POS-SALES', true)
      },
      description: positionNumber.description.value
    },
    {
      label: '岗位名称',
      key: 'positionName',
      type: 'input',
      props: { maxlength: 50, placeholder: '请输入岗位名称' }
    },
    {
      label: '排序',
      key: 'sort',
      type: 'number',
      props: { min: 0, max: 9999, controlsPosition: 'right', class: '!w-full' }
    },
    {
      label: '编制上限',
      key: 'headcountLimit',
      type: 'number',
      props: {
        min: 1,
        max: 9999,
        disabled: !form.value.multipleIncumbentsAllowed,
        controlsPosition: 'right',
        class: '!w-full'
      },
      help: form.value.multipleIncumbentsAllowed
        ? '允许多人共享该岗位时的最大在岗人数。'
        : '单人岗位固定为 1 人。'
    },
    {
      label: '允许多人任职',
      key: 'multipleIncumbentsAllowed',
      type: 'switch',
      props: {
        activeText: '多人岗位',
        inactiveText: '单人岗位',
        inlinePrompt: true,
        onChange: (value: boolean) => {
          if (!value) form.value.headcountLimit = 1
        }
      }
    },
    {
      label: '状态',
      key: 'enabled',
      type: 'switch',
      props: {
        activeText: '启用',
        inactiveText: '停用',
        inlinePrompt: true
      }
    },
    {
      label: '岗位说明',
      key: 'description',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 4, maxlength: 300, showWordLimit: true }
    }
  ])

  const replaceForm = (next: Position): void => {
    Object.keys(form.value).forEach((key) => delete form.value[key as keyof Position])
    Object.assign(form.value, next)
  }
  const resetForm = async (): Promise<void> => {
    replaceForm(createInitialForm())
    await nextTick()
    formRef.value?.clearValidate()
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      const type = form.value.id ? 'edit' : 'add'
      if (type === 'edit') await editPosition(structuredClone(toRaw(form.value)))
      else await addPosition(structuredClone(toRaw(form.value)))
      emit('success', type)
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (
    row?: Position,
    defaults: PositionDialogDefaults = {}
  ): Promise<void> => {
    await resetForm()
    if (row) {
      replaceForm({ ...createInitialForm(), ...structuredClone(toRaw(row)) })
    } else if (defaults.organizationId) {
      form.value.organizationId = defaults.organizationId
    }
    await dialogRef.value?.handleOpen(row, {
      title: row ? '编辑岗位' : '新增岗位',
      subtitle: row ? '维护岗位归属、任职规则与启用状态' : '创建组织中的具体任职岗位',
      confirmText: row ? '保存更改' : '创建岗位',
      contentMaxHeight: 'calc(100vh - 184px)',
      loading: true,
      onOpen: async (_openRow, api) => {
        api.setLoading(true)
        try {
          await Promise.all([
            positionNumber.loadRule(),
            formRef.value?.reloadOptions('organizationId'),
            formRef.value?.reloadOptions('jobProfileId'),
            formRef.value?.reloadOptions('gradeId')
          ])
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit,
      onReset: () => void resetForm()
    })
  }

  defineExpose({ handleOpen, handleClose: () => dialogRef.value?.handleClose() })
</script>

<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="experience-question-dialog">
      <div class="experience-question-dialog__survey">
        <span><ArtSvgIcon icon="ri:questionnaire-line" /></span>
        <div>
          <small>调查题库</small>
          <strong>{{ survey?.surveyName }}</strong>
          <p>{{ survey?.surveyCode }} · 只有草稿调查可以维护题目</p>
        </div>
      </div>

      <div class="experience-question-dialog__guidance" role="note">
        <ArtSvgIcon icon="ri:shield-user-line" />
        <span>使用中性、单一主题的陈述句；开放文本同样受匿名阈值和独立评论权限保护。</span>
      </div>

      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="form.items"
        :rules="form.rules"
        :span="12"
        :gutter="22"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { saveEmployeeExperienceRecord } from '@hr/api'

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<ArtFormExpose>()
  const survey = shallowRef<Api.Hr.EmployeeExperienceSurvey>()

  const createInitialModel = (): Api.Hr.EmployeeExperienceQuestion => ({
    id: undefined,
    tenantId: undefined,
    surveyId: '',
    dimension: 'engagement',
    questionText: '',
    answerType: 'rating_5',
    required: true,
    enabled: true,
    sort: 10
  })
  const formModel = reactive<Api.Hr.EmployeeExperienceQuestion>(createInitialModel())
  const dictOptions = (code: string) => getDictMap.value[code] ?? []
  const answerHelp = computed(() =>
    formModel.answerType === 'rating_5'
      ? '适用于态度陈述，1 表示非常不同意，5 表示非常同意'
      : formModel.answerType === 'enps_11'
        ? '适用于推荐意愿题，范围为 0–10'
        : '用于员工补充语境，不参与数值得分计算'
  )
  const formItems = computed<FormItem[]>(() => [
    {
      label: '体验主题',
      key: 'dimension',
      type: 'select',
      options: dictOptions('hrExperienceDimension'),
      props: { placeholder: '请选择题目所属主题' }
    },
    {
      label: '答案方式',
      key: 'answerType',
      type: 'select',
      options: dictOptions('hrExperienceAnswerType'),
      help: answerHelp.value
    },
    {
      label: '题目内容',
      key: 'questionText',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 4,
        maxlength: 500,
        showWordLimit: true,
        placeholder:
          formModel.answerType === 'open_text'
            ? '例如：还有哪些做法能改善您的工作体验？'
            : '例如：我能获得完成工作所需的支持与资源。'
      }
    },
    {
      label: '必答题',
      key: 'required',
      type: 'switch',
      props: { activeText: '必答', inactiveText: '选答' }
    },
    {
      label: '启用状态',
      key: 'enabled',
      type: 'switch',
      props: { activeText: '启用', inactiveText: '停用' }
    },
    {
      label: '展示顺序',
      key: 'sort',
      type: 'number',
      props: { min: 0, max: 9999, controlsPosition: 'right', class: '!w-full' }
    }
  ])
  const form = reactive<{
    model: Api.Hr.EmployeeExperienceQuestion
    items: ComputedRef<FormItem[]>
    rules: FormRules<Api.Hr.EmployeeExperienceQuestion>
  }>({
    model: formModel,
    items: formItems,
    rules: {
      dimension: [{ required: true, message: '请选择体验主题', trigger: 'change' }],
      answerType: [{ required: true, message: '请选择答案方式', trigger: 'change' }],
      questionText: [{ required: true, message: '请输入题目内容', trigger: 'blur' }],
      sort: [{ required: true, message: '请输入展示顺序', trigger: 'change' }]
    }
  })

  const submit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      await saveEmployeeExperienceRecord('question', {
        ...formModel,
        questionText: formModel.questionText.trim()
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查填写内容后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (
    sourceSurvey: Api.Hr.EmployeeExperienceSurvey,
    editData?: Api.Hr.EmployeeExperienceQuestion
  ): Promise<void> => {
    survey.value = sourceSurvey
    Object.assign(formModel, createInitialModel(), editData ?? {}, {
      surveyId: sourceSurvey.id,
      tenantId: sourceSurvey.tenantId
    })
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(undefined, {
      title: editData ? '编辑调查题目' : '新增调查题目',
      subtitle: '题目维度决定聚合分析口径，发布后题目不可更改',
      confirmText: editData ? '保存题目' : '添加题目',
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
  .experience-question-dialog {
    display: grid;
    gap: 16px;

    &__survey {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      padding: 13px 15px;
      background: color-mix(in srgb, var(--theme-color) 5%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 14%, var(--art-card-border));
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
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      strong {
        margin-top: 1px;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      p {
        margin: 2px 0 0;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__guidance {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.55;
      color: var(--el-color-success-dark-2);
      background: color-mix(in srgb, var(--el-color-success) 8%, transparent);
      border-left: 3px solid var(--el-color-success);
      border-radius: var(--el-border-radius-base);
    }
  }
</style>

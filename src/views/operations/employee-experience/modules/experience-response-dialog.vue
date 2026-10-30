<template>
  <ArtDialog :loading="loading" ref="dialogRef" size="lg">
    <ArtAsyncState
      :error="errorMessage"
      :empty="!canAnswer"
      :empty-text="unavailableTitle"
      :empty-description="
        detail?.availability === 'available'
          ? '请联系调查管理员核对题目配置后重新打开。'
          : '请返回调查列表查看当前开放和完成状态。'
      "
      :min-height="240"
      @retry="loadDetail"
    >
      <div v-if="detail" class="experience-response-dialog">
        <section
          class="experience-response-dialog__hero"
          aria-labelledby="experience-response-title"
        >
          <div>
            <span
              aria-hidden="true"
              class="grid size-[46px] place-items-center text-[var(--theme-color)] rounded-[var(--el-border-radius-base)]"
            >
              <ArtSvgIcon icon="ri:chat-heart-line" />
            </span>
            <div>
              <small>{{ detail.surveyCode }}</small>
              <h3 id="experience-response-title">{{ detail.surveyName }}</h3>
              <p>{{ detail.description || '请基于近期真实体验作答。' }}</p>
            </div>
          </div>
          <dl>
            <div
              ><dt>题目</dt><dd>{{ detail.questions?.length ?? detail.questionCount }} 题</dd></div
            >
            <div
              ><dt>开放至</dt><dd>{{ formatDate(detail.endDate) }}</dd></div
            >
          </dl>
        </section>

        <div class="experience-response-dialog__privacy" role="note">
          <ArtSvgIcon icon="ri:shield-user-line" />
          <div>
            <strong>本次提交不保存您的员工身份</strong>
            <p
              >{{ detail.privacyNote }} 低于
              {{ detail.minimumGroupSize }} 人的结果不会向管理者展示。</p
            >
          </div>
        </div>

        <ArtForm
          ref="formRef"
          v-model="form.model"
          :items="form.items"
          :rules="form.rules"
          :span="24"
          :gutter="20"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
          class="experience-response-dialog__form"
        />

        <footer class="experience-response-dialog__footer-note">
          <ArtSvgIcon icon="ri:information-line" />
          提交后不能再次编辑。系统只在达到匿名阈值后展示聚合结果，不将答案用于个人绩效、任职或员工关系判断。
        </footer>
      </div>
    </ArtAsyncState>
  </ArtDialog>
</template>

<script setup lang="ts">
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { fetchEmployeeExperienceDetail, submitEmployeeExperienceResponse } from '@hr/api'

  interface FormModel {
    answers: Record<string, number | string | undefined>
  }
  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const { confirmAction } = useArtFeedback()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<ArtFormExpose>()
  const detail = shallowRef<Api.Hr.EmployeeExperienceMySurvey>()
  const canAnswer = computed(
    () => detail.value?.availability === 'available' && Boolean(detail.value.questions?.length)
  )
  const unavailableTitle = computed(() => {
    switch (detail.value?.availability) {
      case 'completed':
        return '您已完成本次调查'
      case 'expired':
        return '本次调查已结束'
      case 'unavailable':
        return '本次调查尚未开放'
      default:
        return '调查暂无可填写题目'
    }
  })
  const participantId = ref('')
  const loading = ref(false)
  const errorMessage = ref('')
  let detailRequest = 0

  const loadDetail = async (): Promise<void> => {
    const request = ++detailRequest
    const id = participantId.value
    loading.value = true
    errorMessage.value = ''
    dialogRef.value?.setOptions({ confirmDisabled: true })
    try {
      const response = await fetchEmployeeExperienceDetail<Api.Hr.EmployeeExperienceMySurvey>(
        'my',
        id
      )
      if (request !== detailRequest || id !== participantId.value) return
      if (response.error) throw response.error
      detail.value = response.data ?? undefined
      dialogRef.value?.setOptions({ confirmDisabled: !canAnswer.value })
      await nextTick()
      formRef.value?.clearValidate()
    } catch {
      if (request === detailRequest) errorMessage.value = '调查题目加载失败，请重新加载后填写'
    } finally {
      if (request === detailRequest) loading.value = false
    }
  }
  onBeforeUnmount(() => {
    detailRequest++
  })
  const formModel = reactive<FormModel>({ answers: {} })

  const formatDate = createDateTimeFormatter({ format: 'YYYY-MM-DD' })
  const ratingOptions = Array.from({ length: 11 }, (_, score) => ({
    label: String(score),
    value: score
  }))

  const formItems = computed<FormItem[]>(() => {
    const items: FormItem[] = []
    let previousDimension = ''
    for (const [index, question] of (detail.value?.questions ?? []).entries()) {
      if (question.dimension !== previousDimension) {
        previousDimension = question.dimension
        items.push({
          label: userStore.getDictLabelByValue(
            'hrExperienceDimension',
            question.dimension,
            question.dimension ?? '--'
          ),
          key: `dimension-${question.dimension}`,
          type: 'divider',
          span: 24
        })
      }
      const label = `${index + 1}. ${question.questionText}${question.required ? '' : '（选答）'}`
      const key = `answers.${question.id}`
      if (question.answerType === 'rating_5') {
        items.push({
          label,
          key,
          type: 'rate',
          span: 24,
          help: '1 非常不同意 · 3 一般 · 5 非常同意',
          props: {
            max: 5,
            showText: true,
            texts: ['非常不同意', '不同意', '一般', '同意', '非常同意'],
            clearable: !question.required
          }
        })
      } else if (question.answerType === 'enps_11') {
        items.push({
          label,
          key,
          type: 'radioGroup',
          span: 24,
          options: ratingOptions,
          help: '0 完全不愿意 · 10 非常愿意',
          props: { optionType: 'button', class: 'experience-response-dialog__enps' }
        })
      } else {
        items.push({
          label,
          key,
          type: 'input',
          span: 24,
          props: {
            type: 'textarea',
            rows: 4,
            maxlength: 2000,
            showWordLimit: true,
            placeholder: '请勿填写姓名、工号、手机号等可识别个人身份的信息'
          }
        })
      }
    }
    return items
  })
  const formRules = computed<FormRules>(() => {
    const rules: FormRules = {}
    for (const question of detail.value?.questions ?? []) {
      if (!question.required || !question.id) continue
      rules[`answers.${question.id}`] = [
        {
          required: true,
          message: '请完成此必答题',
          trigger: question.answerType === 'open_text' ? 'blur' : 'change'
        }
      ]
    }
    return rules
  })
  const form = reactive<{
    model: FormModel
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules>
  }>({ model: formModel, items: formItems, rules: formRules })

  const toAnswers = (): Api.Hr.EmployeeExperienceAnswerInput[] =>
    (detail.value?.questions ?? []).flatMap((question) => {
      if (!question.id) return []
      const value = formModel.answers[question.id]
      if (value === undefined || value === null || value === '') return []
      return [
        question.answerType === 'open_text'
          ? { questionId: question.id, textAnswer: String(value).trim() }
          : { questionId: question.id, numericScore: Number(value) }
      ]
    })

  const submit = async (): Promise<boolean> => {
    if (loading.value || errorMessage.value || !canAnswer.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      try {
        await confirmAction(
          '匿名提交后不能再次编辑。系统只保留完成状态，不保存员工与答案之间的关联。',
          '确认匿名提交',
          { confirmButtonText: '确认匿名提交', cancelButtonText: '返回检查', type: 'info' }
        )
      } catch (error) {
        if (error === 'cancel' || error === 'close') return false
        throw error
      }
      await submitEmployeeExperienceResponse(participantId.value, toAnswers())
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '提交失败，请检查填写内容后重试', 'warning')
      return false
    }
  }
  const handleOpen = async (record: Api.Hr.EmployeeExperienceMySurvey): Promise<void> => {
    participantId.value = record.id
    detail.value = undefined
    errorMessage.value = ''
    loading.value = true
    formModel.answers = {}
    await dialogRef.value?.handleOpen(undefined, {
      title: '填写匿名员工体验调查',
      subtitle: '请基于真实体验作答，提交后答案与员工身份物理分离',
      confirmText: '匿名提交',
      confirmDisabled: true,
      contentMaxHeight: 'calc(100vh - 164px)',
      onOpen: loadDetail,
      onClose: () => {
        detailRequest++
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
  .experience-response-dialog {
    display: grid;
    gap: 16px;

    &__hero {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      justify-content: space-between;
      padding: 17px;
      background:
        radial-gradient(
          circle at 98% 4%,
          color-mix(in srgb, var(--theme-color) 11%, transparent),
          transparent 36%
        ),
        color-mix(in srgb, var(--theme-color) 4%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 15%, var(--art-card-border));
      border-radius: var(--art-surface-radius);

      > div:first-child {
        display: grid;
        grid-template-columns: 46px minmax(0, 1fr);
        gap: 13px;
        min-width: 0;
      }

      > div:first-child > span {
        background: color-mix(in srgb, var(--theme-color) 12%, transparent);
      }

      small {
        font-size: 10px;
        font-weight: 700;
        color: var(--theme-color);
      }

      h3 {
        margin: 2px 0 0;
        font-size: 18px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 4px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--el-text-color-secondary);
      }

      dl {
        display: flex;
        flex: 0 0 auto;
        gap: 8px;
        margin: 0;
      }

      dl > div {
        min-width: 88px;
        padding: 8px 10px;
        background: color-mix(in srgb, var(--default-box-color) 88%, transparent);
        border: 1px solid var(--art-card-border);
        border-radius: var(--el-border-radius-base);
      }

      dt {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 2px 0 0;
        font-size: 13px;
        font-weight: 650;
        color: var(--el-text-color-primary);
      }
    }

    &__privacy {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px 14px;
      color: var(--el-color-success-dark-2);
      background: color-mix(in srgb, var(--el-color-success) 8%, transparent);
      border-left: 3px solid var(--el-color-success);
      border-radius: var(--el-border-radius-base);

      > :deep(.art-svg-icon) {
        flex: 0 0 auto;
        margin-top: 2px;
      }

      strong {
        font-size: 13px;
      }

      p {
        margin: 2px 0 0;
        font-size: 11px;
        line-height: 1.5;
      }
    }

    &__form {
      padding: 4px 2px;

      :deep(.experience-response-dialog__enps) {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      :deep(.experience-response-dialog__enps .el-radio-button__inner) {
        min-width: 40px;
        border: 1px solid var(--el-border-color) !important;
        border-radius: var(--el-border-radius-base) !important;
        box-shadow: none !important;
      }
    }

    &__footer-note {
      display: flex;
      gap: 7px;
      align-items: flex-start;
      padding-top: 12px;
      font-size: 11px;
      line-height: 1.55;
      color: var(--el-text-color-secondary);
      border-top: 1px dashed var(--art-card-border);
    }
  }

  @media only screen and (width <= 767px) {
    .experience-response-dialog__hero {
      display: grid;

      dl {
        width: 100%;
      }

      dl > div {
        flex: 1;
      }
    }
  }
</style>

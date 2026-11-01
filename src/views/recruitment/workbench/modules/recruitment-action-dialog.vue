<template>
  <ArtDialog ref="dialogRef">
    <div class="recruitment-action-dialog">
      <div class="recruitment-action-dialog__summary">
        <ArtSvgIcon :icon="summary.icon" />
        <div
          ><strong>{{ summary.title }}</strong
          ><span>{{ summary.description }}</span></div
        >
      </div>
      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="form.items"
        :rules="form.rules"
        :span="24"
        label-position="top"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import {
    cancelRecruitmentInterview,
    completeRecruitmentInterview,
    completeRecruitmentTask,
    transitionCandidateStage,
    transitionRecruitmentHandoff,
    transitionRecruitmentOffer,
    type RecruitmentOfferAction
  } from '@hr/api'

  type ActionKind =
    | 'interview_complete'
    | 'candidate_reject'
    | 'candidate_withdraw'
    | 'interview_cancel'
    | 'interview_no_show'
    | 'offer_reject'
    | 'offer_decline'
    | 'offer_withdraw'
    | 'handoff_cancel'
    | 'task_skip'

  interface ActionOpenData {
    kind: ActionKind
    id: string
    subject: string
  }

  interface ActionFormModel {
    score?: number
    recommendation?: string
    feedback: string
    reason: string
  }

  interface FormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<FormExpose>()
  const action = ref<ActionOpenData>({ kind: 'candidate_reject', id: '', subject: '' })
  const createInitialModel = (): ActionFormModel => ({
    score: undefined,
    recommendation: undefined,
    feedback: '',
    reason: ''
  })
  const model = reactive<ActionFormModel>(createInitialModel())
  const isInterviewEvaluation = computed(() => action.value.kind === 'interview_complete')
  const form = reactive<{
    model: ActionFormModel
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<ActionFormModel>>
  }>({
    model,
    items: computed((): FormItem[] =>
      isInterviewEvaluation.value
        ? [
            {
              label: '综合评分',
              key: 'score',
              type: 'number',
              props: { min: 0, max: 100, precision: 1, controls: false, class: '!w-full' }
            },
            {
              label: '录用建议',
              key: 'recommendation',
              type: 'select',
              options: getDictMap.value.hrInterviewRecommendation ?? [],
              props: { placeholder: '请选择录用建议' }
            },
            {
              label: '评价依据',
              key: 'feedback',
              type: 'textarea',
              props: {
                rows: 5,
                maxlength: 1200,
                showWordLimit: true,
                placeholder: '记录事实证据、能力判断与风险点'
              }
            }
          ]
        : [
            {
              label: '处理原因',
              key: 'reason',
              type: 'textarea',
              props: {
                rows: 4,
                maxlength: 500,
                showWordLimit: true,
                placeholder: '请说明事实原因，便于后续审计与复盘'
              }
            }
          ]
    ),
    rules: computed(() =>
      isInterviewEvaluation.value
        ? {
            score: [{ required: true, message: '请输入综合评分', trigger: 'change' }],
            recommendation: [{ required: true, message: '请选择录用建议', trigger: 'change' }],
            feedback: [{ required: true, message: '请填写评价依据', trigger: 'blur' }]
          }
        : { reason: [{ required: true, message: '请填写处理原因', trigger: 'blur' }] }
    )
  })

  const summary = computed(() => {
    if (isInterviewEvaluation.value)
      return {
        icon: 'ri:survey-line',
        title: `提交 ${action.value.subject} 的面试评价`,
        description: '评价提交后形成独立审计记录，不能通过普通编辑覆盖。'
      }
    return {
      icon: 'ri:information-line',
      title: action.value.subject,
      description: '原因会进入招聘流程审计记录，请使用客观、可复盘的业务表述。'
    }
  })

  const executeAction = async (): Promise<void> => {
    const { kind, id } = action.value
    if (kind === 'interview_complete') {
      await completeRecruitmentInterview(
        id,
        Number(form.model.score),
        form.model.recommendation!,
        form.model.feedback
      )
      return
    }
    if (kind === 'candidate_reject' || kind === 'candidate_withdraw') {
      await transitionCandidateStage(
        id,
        kind === 'candidate_reject' ? 'rejected' : 'withdrawn',
        form.model.reason
      )
      return
    }
    if (kind === 'interview_cancel' || kind === 'interview_no_show') {
      await cancelRecruitmentInterview(id, kind === 'interview_no_show', form.model.reason)
      return
    }
    if (kind.startsWith('offer_')) {
      const offerAction = kind.replace('offer_', '') as RecruitmentOfferAction
      await transitionRecruitmentOffer(id, offerAction, form.model.reason)
      return
    }
    if (kind === 'handoff_cancel') {
      await transitionRecruitmentHandoff(id, 'cancel', form.model.reason)
      return
    }
    await completeRecruitmentTask(id, true, form.model.reason)
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (isInterviewEvaluation.value && !form.model.feedback.trim()) {
        ElMessage.warning('请填写可复盘的面试评价依据')
        return false
      }
      await executeAction()
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '处理未完成，请检查状态后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (data: ActionOpenData): Promise<void> => {
    action.value = data
    Object.assign(form.model, createInitialModel())
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(undefined, {
      title: isInterviewEvaluation.value ? '完成面试评价' : '记录处理原因',
      subtitle: data.subject,
      confirmText: isInterviewEvaluation.value ? '提交评价' : '确认处理',
      contentMaxHeight: 'calc(100vh - 220px)',
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .recruitment-action-dialog {
    display: grid;
    gap: 16px;

    &__summary {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 14px 16px;
      background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 18%, var(--art-card-border));
      border-radius: var(--el-border-radius-base);

      > :deep(.art-svg-icon) {
        margin-top: 2px;
        font-size: 20px;
        color: var(--theme-color);
      }

      div {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      span {
        font-size: 13px;
        line-height: 1.6;
        color: var(--el-text-color-regular);
      }
    }
  }
</style>

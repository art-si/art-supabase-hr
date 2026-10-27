<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="service-assignment-dialog">
      <div class="service-assignment-dialog__case">
        <span aria-hidden="true"><ArtSvgIcon icon="ri:user-settings-line" /></span>
        <div>
          <small>{{ record?.requestNo }}</small>
          <strong>{{ record?.title }}</strong>
          <p>分派后处理人可开始响应、请求补充材料并提交解决结果。</p>
        </div>
      </div>

      <ArtForm
        ref="formRef"
        :model-value="form"
        @update:model-value="replaceReactiveModel(form, $event)"
        :items="[]"
        :rules="rules"
        custom-layout
        scroll-to-error
        :show-reset="false"
        :show-submit="false"
        root-class="p-0! md:p-0!"
      >
        <ElFormItem label="工单处理人" prop="assigneeEmployeeId" required>
          <ArtEmployeeSelect
            v-model="form.assigneeEmployeeId"
            v-model:selected-data="selection"
            :tenant-id="record?.tenantId"
            title="选择员工服务处理人"
            subtitle="仅选择当前租户内承担员工服务交付的有效员工"
            placeholder="请选择处理人"
          />
        </ElFormItem>
        <ElFormItem label="分派说明" prop="comment">
          <ElInput
            v-model="form.comment"
            type="textarea"
            :rows="3"
            maxlength="300"
            show-word-limit
            placeholder="可选：补充分派依据或处理要求"
          />
        </ElFormItem>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { employeeReferenceSelection } from '@/utils/form/employee-reference'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { nextTick, reactive, ref, shallowRef } from 'vue'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { transitionServiceRequest } from '@hr/api'

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const record = shallowRef<Api.Hr.ServiceRequest>()
  const form = reactive({ assigneeEmployeeId: undefined as string | undefined, comment: '' })
  const rules: FormRules = {
    assigneeEmployeeId: [{ required: true, message: '请选择工单处理人', trigger: 'change' }]
  }
  const selection = ref<EmployeeIntegrationItem[]>([])

  const submit = async (): Promise<boolean> => {
    if (!record.value?.id) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      const assigneeEmployeeId = form.assigneeEmployeeId
      if (!assigneeEmployeeId) return false
      await transitionServiceRequest(record.value.id, 'assign', assigneeEmployeeId, form.comment)
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '工单分派失败，请核对处理人后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (request: Api.Hr.ServiceRequest): Promise<void> => {
    record.value = request
    form.assigneeEmployeeId = request.assignedEmployeeId || undefined
    selection.value = employeeReferenceSelection(request.assignee, request.tenantId)
    form.comment = ''
    void nextTick(() => formRef.value?.clearValidate())
    await dialogRef.value?.handleOpen(undefined, {
      title: '分派员工服务工单',
      subtitle: '明确唯一处理人，避免队列内无人负责',
      confirmText: request.assignedEmployeeId ? '更新分派' : '确认分派',
      onConfirm: submit
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .service-assignment-dialog {
    display: grid;
    gap: 18px;

    &__case {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      padding: 14px;
      background: color-mix(in srgb, var(--theme-color) 6%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 16%, var(--art-card-border));
      border-radius: var(--art-surface-radius);

      > span {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
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
        margin-top: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      p {
        margin: 5px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--el-text-color-secondary);
      }
    }
  }
</style>

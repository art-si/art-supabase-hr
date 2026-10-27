<template>
  <nav
    class="hr-entity-navigation"
    :class="{ 'is-compact': compact }"
    :aria-label="navigationLabel"
    role="tablist"
  >
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === item.value"
      :class="{ 'is-active': modelValue === item.value }"
      @click="selectItem(item.value)"
    >
      <span class="hr-entity-navigation__icon" aria-hidden="true">
        <ArtSvgIcon :icon="item.icon" />
      </span>
      <span class="hr-entity-navigation__content">
        <strong>{{ item.label }}</strong>
        <small>{{ item.description }}</small>
      </span>
      <ArtSvgIcon class="hr-entity-navigation__arrow" icon="ri:arrow-right-s-line" />
    </button>
  </nav>
</template>

<script setup lang="ts">
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'

  export interface HrEntityNavigationItem {
    value: string
    label: string
    description: string
    icon: string
  }

  const props = withDefaults(
    defineProps<{
      modelValue: string
      items: HrEntityNavigationItem[]
      navigationLabel: string
      compact?: boolean
    }>(),
    { compact: false }
  )
  const emit = defineEmits<{
    'update:modelValue': [value: string]
    change: [value: string]
  }>()

  const selectItem = (value: string): void => {
    if (value === props.modelValue) return
    emit('update:modelValue', value)
    emit('change', value)
  }
</script>

<style scoped lang="scss">
  .hr-entity-navigation {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 10px;
    min-width: 0;

    button {
      position: relative;
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr) 18px;
      gap: 10px;
      align-items: center;
      min-width: 0;
      min-height: 66px;
      padding: 10px 12px;
      overflow: hidden;
      color: inherit;
      text-align: left;
      cursor: pointer;
      background: color-mix(in srgb, var(--default-box-color) 96%, transparent);
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-surface-radius);
      transition:
        border-color 160ms ease,
        background-color 160ms ease,
        box-shadow 160ms ease,
        transform 160ms ease;

      &::before {
        position: absolute;
        inset: 8px auto 8px 0;
        width: 3px;
        content: '';
        background: var(--theme-color);
        border-radius: 0 999px 999px 0;
        opacity: 0;
        transform: scaleY(0.45);
        transition:
          opacity 160ms ease,
          transform 160ms ease;
      }

      &:hover {
        border-color: color-mix(in srgb, var(--theme-color) 30%, var(--art-card-border));
        transform: translateY(-1px);
      }

      &:focus-visible {
        outline: 2px solid var(--theme-color);
        outline-offset: 2px;
      }

      &.is-active {
        background: color-mix(in srgb, var(--theme-color) 6%, var(--default-box-color));
        border-color: color-mix(in srgb, var(--theme-color) 45%, var(--art-card-border));
        box-shadow: 0 7px 18px color-mix(in srgb, var(--theme-color) 9%, transparent);

        &::before {
          opacity: 1;
          transform: scaleY(1);
        }

        .hr-entity-navigation__arrow {
          color: var(--theme-color);
          transform: translateX(2px);
        }
      }
    }

    &__icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--theme-color) 13%, transparent);
      border-radius: var(--art-surface-radius);

      :deep(.art-svg-icon) {
        font-size: 18px;
      }
    }

    &__content {
      display: grid;
      min-width: 0;

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 13px;
        font-weight: 650;
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 4px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__arrow {
      color: var(--el-text-color-secondary);
      transition:
        color 160ms ease,
        transform 160ms ease;
    }

    &.is-compact button {
      min-height: 58px;
    }
  }

  @media only screen and (width <= 767px) {
    .hr-entity-navigation {
      grid-template-columns: 1fr;

      button {
        min-height: 58px;
      }
    }
  }
</style>

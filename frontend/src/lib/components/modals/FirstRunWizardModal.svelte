<!-- src/lib/components/modals/FirstRunWizardModal.svelte -->
<!-- Initial Setup Wizard: Delegating wrapper to SetupWizardModal -->

<script lang="ts">
  import SetupWizardModal from '../setup/SetupWizardModal.svelte';

  let {
    isOpen = $bindable(false),
    onComplete,
    maxSteps = 3,
  }: {
    isOpen?: boolean;
    onComplete?: () => void;
    maxSteps?: number;
  } = $props();
</script>

<SetupWizardModal bind:isOpen {onComplete} {maxSteps} />

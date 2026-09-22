<script lang="ts">
    import Step2Scaffolding from "./Step2Scaffolding.svelte";
    import SubmitButton from "$lib/components/common/SubmitButton.svelte";

    let step = 1;
</script>

<div class="setup-wizard-container">
    <Wizard bind:currentStep={step}>
        <WizardSteps>
            <WizardStep label="Welcome & Campaign" step="1">
                <div class="step-content">
                    <h2>Welcome to Graywood VTT</h2>
                    <p>Let's set up your campaign environment.</p>
                </div>
            </WizardStep>

            <WizardStep label="Verify Campaign Directory & Seeding" step="2">
                <Step2Scaffolding />
            </WizardStep>

            <WizardStep label="Display & Rules" step="3">
                <div class="step-content">
                    <h2>Display Architecture & Rules</h2>
                    <!-- Display & Rules configuration content -->
                </div>
            </WizardStep>
        </WizardSteps>

        <div class="wizard-footer">
            <div class="step-counter">
                Step {step} of 3
            </div>

            <div class="wizard-navigation">
                {#if step > 1}
                    <button class="btn-back" on:click={() => (step -= 1)}
                        >Back</button
                    >
                {/if}
                {#if step < 3}
                    <button class="btn-next" on:click={() => (step += 1)}
                        >Next Step</button
                    >
                {:else}
                    <SubmitButton />
                {/if}
            </div>
        </div>
    </Wizard>
</div>

<style>
    .setup-wizard-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
    }
    .wizard-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 2rem;
    }
    .step-counter {
        font-weight: 500;
    }
</style>

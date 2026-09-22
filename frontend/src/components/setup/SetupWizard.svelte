diff --git a/frontend/src/components/setup/SetupWizard.svelte b/frontend/src/components/setup/SetupWizard.svelte
--- a/frontend/src/components/setup/SetupWizard.svelte
+++ b/frontend/src/components/setup/SetupWizard.svelte
@@ -100,7 +100,6 @@
     <WizardStep label="Verify Campaign Directory" step="2">
         <FileDropzone />
     </WizardStep>
-    <WizardStep label="Compendium Seeding & Source Ingestion" step="4">
-        <FileDropzone />
-    </WizardStep>
     <WizardStep label="Complete Setup" step="3">
         <SubmitButton />
     </WizardStep>
@@ -120,7 +119,6 @@
         <div class="step-counter">
             Step {step} of 3
         </div>
-        <div class="step-counter">
-            Step {step} of 4
-        </div>
     </WizardSteps>
     <div class="step-grid">
         <div class="step-1">
             <div class="step-2">
                 <FileDropzone />
             </div>
-            <div class="step-4">
-                <FileDropzone />
-            </div>
             <div class="step-3">
                 <SubmitButton />
             </div>
         </div>
     </div>
 </Wizard>

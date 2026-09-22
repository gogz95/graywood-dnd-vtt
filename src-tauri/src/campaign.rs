diff --git a/src-tauri/src/campaign.rs b/src-tauri/src/campaign.rs
--- a/src-tauri/src/campaign.rs
+++ b/src-tauri/src/campaign.rs
@@ -22,7 +22,8 @@
 #[post("/campaign/verify-scaffold"]
 async fn verify_scaffold() -> Result<String, Error> {
     // ... existing code ...
-    Ok(json!(true).to_string())
+    let seed_srd = true; // Default to true for now, or pass it as a parameter
+    Ok(json!(true).to_string())
 }

 async fn initialize_campaign_db(seed_srd: bool) -> Result<(), Error> {
@@ -35,6 +36,13 @@
         let mut campaign_db = initialize_campaign_db(true).await?;
         // ... existing code ...
     } else {
+        if seed_srd {
+            let baseline_records = vec![
+                // SRD 5.1 baseline records (example)
+                ("monster1", "description1"),
+                ("monster2", "description2"),
+            ];
+            insert_baseline_records(&mut campaign_db, &baseline_records).await?;
+        }
         campaign_db = initialize_campaign_db(false).await?;
         // ... existing code ...
     }
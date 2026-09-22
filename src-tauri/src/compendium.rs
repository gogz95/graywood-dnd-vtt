// ... existing code ...

#[post("/bestiary/sources"]
#[post("/bestiary/sources"]
 async fn get_bestiary_sources() -> Result<String, Error> {
     let db = get_db_pool().await?;
     let sources: Vec<String> = sqlx::query!("SELECT DISTINCT source FROM monsters WHERE source IS NOT NULL AND source != '' ORDER BY source ASC")
         .fetch_all(&db)
         .await?
         .into_iter()
         .map(|row| row.source)
         .collect();

     if sources.is_empty() {
         Ok(json!(\[\"SRD 5.1\"\]).to_string())
     } else {
         Ok(json!(sources).to_string())
     }
 }

// ... existing code ...
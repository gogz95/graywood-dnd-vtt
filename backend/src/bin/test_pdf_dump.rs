// src-tauri/src/bin/test_pdf_dump.rs
// CLI diagnostic probe for PDF outline parsing and raw text extraction.

use graywood_vtt_lib::services::pdf_compiler::{inspect_pdf_toc_fast, parse_page_text_layout};
use std::env;
use std::fs::File;
use std::io::Read;
use std::path::Path;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: cargo run --bin test_pdf_dump -- <path-to-pdf>");
        std::process::exit(1);
    }

    let pdf_path_str = &args[1];
    let pdf_path = Path::new(pdf_path_str);
    if !pdf_path.exists() {
        eprintln!("Error: File not found: {:?}", pdf_path);
        std::process::exit(1);
    }

    println!("=== PDF Diagnostic Probe ===");
    println!("Target File: {:?}", pdf_path);

    let mut file = File::open(pdf_path).expect("Failed to open PDF file");
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).expect("Failed to read PDF bytes");
    println!("File size: {} bytes", bytes.len());

    // 1. Table of Contents / Outline Bookmarks
    match inspect_pdf_toc_fast(&bytes) {
        Ok(toc) => {
            println!("\n--- Outline / Bookmarks ---");
            println!("Estimated total pages: {}", toc.total_pages);
            println!("Total bookmark entries mapped: {}", toc.entity_page_map.len());
            let mut entries: Vec<(&String, &usize)> = toc.entity_page_map.iter().collect();
            entries.sort_by_key(|e| e.1);
            for (idx, (title, page)) in entries.iter().take(10).enumerate() {
                println!("  [{}] Page {}: {}", idx + 1, page, title);
            }
        }
        Err(err) => {
            println!("\n--- Outline / Bookmarks Error ---");
            println!("inspect_pdf_toc_fast returned error: {}", err);
        }
    }

    // 2. Extract raw text from Pages 1 to 5
    println!("\n--- Page Text Extraction (Pages 1 to 5) ---");
    let anchors = ["Armor Class", "Hit Points", "d20", "Level"];

    for page_num in 1..=5 {
        let layout = parse_page_text_layout(&bytes, page_num);
        let raw_text = layout.reconstruct_two_column_text();
        let char_count = raw_text.chars().count();
        let fragment_count = layout.fragments.len();

        let mut matches = Vec::new();
        for anchor in &anchors {
            if raw_text.contains(anchor) {
                matches.push(*anchor);
            }
        }

        println!(
            "Page {}: {} characters, {} fragments | Anchors matched: {:?}",
            page_num, char_count, fragment_count, matches
        );

        if page_num == 2 || page_num == 3 {
            println!("\n>>> Sample Snippet (First 500 chars of Page {}):", page_num);
            let snippet: String = raw_text.chars().take(500).collect();
            println!("----------------------------------------");
            println!("{}", snippet);
            println!("----------------------------------------\n");
        }
    }
}

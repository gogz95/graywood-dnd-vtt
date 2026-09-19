---
description: Enforce zero-placeholder policy and automated completeness verification
globs: "**/*"
alwaysApply: true
---

# STRICT ZERO-PLACEHOLDER INSTRUCTION

1. NO CODE OMISSIONS: Never generate comments such as:
   - `// TODO: implement this`
   - `// Add your logic here`
   - `/* ... remaining methods ... */`
   - `throw new NotImplementedException()`
   - Empty catch/error blocks or unhandled branches.
2. PRODUCTION COMPLETION: Write out complete functions, exhaustive SQL schemas, fully typed data models, error handlers, and imports. If a feature is specified, implement its full deterministic logic.
3. CONCRETE DATA MATRICES: Do not truncate sample tables or arrays with `...`. Insert the complete dataset or migration schema.
4. SELF-VERIFICATION RUN: Before presenting an Artifact, scan the diff for keywords (`TODO`, `FIXME`, `placeholder`, `stub`, `pass`). If any exist, replace them with functional implementation before finishing the task.
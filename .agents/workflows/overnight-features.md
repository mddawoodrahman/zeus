---
name: overnight-features
description: Implements Zeus features sequentially with Plan → Implement → Test → Verify loop.
---

# Overnight Feature Pipeline for Zeus (Autonomous Loop)

## Goal

Implement the following features one by one: Prompt Library + Versioning, Context-Aware Multi-Turn Enhancement, Smart Router 2.0, Custom / OpenAI-Compatible Providers, Team / Shared Presets.

## For each feature:

1.  **Plan**: Create a detailed implementation plan **as an artifact**, defining the storage schema, UI changes, and test cases.
2.  **Implement**: Write the code based on the plan.
3.  **Test**: Use the `run-tests` skill to run the project's test suite (`npm test`).
4.  **Verify & Loop**: If the tests fail, analyze the errors, fix the code, and return to step 3. **Do not consider the feature complete until all tests pass.** Continue this loop until all tests pass.
5.  **Proceed**: Once all tests pass, move to the next feature in the list.

Repeat this entire process until all features are implemented and passing.

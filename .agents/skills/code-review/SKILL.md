---
name: code-review
description: Reviews code changes for bugs, style issues, and adherence to Zeus architecture.
---
# Zeus Code Review Skill
When reviewing code, follow these steps:
1.  **Correctness**: Verify the code satisfies the feature specification.
2.  **Architecture**: Ensure new code respects the modular boundaries (e.g., settings logic in `settings/settings.js`, model metadata in `model-registry.js`).
3.  **Testing**: Confirm that new behavior has corresponding Vitest tests.
4.  **Manifest V3 Compatibility**: Check that no deprecated APIs are used and permissions are not overly broad.
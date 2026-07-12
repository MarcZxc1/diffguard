# Vulnerable Teaching Fixtures

This folder contains isolated, intentionally vulnerable teaching fixtures. 
These files are **not imported or used by the production application** and exist purely so DiffGuard can be tested against realistic insecure code patterns.

## Safety Notes

- No real secrets, credentials, tokens, or personal data are included.
- All credentials are fake placeholders for scanner validation only.
- These examples are inert and do not affect runtime behavior.

## Vulnerability Patterns Included

- Hardcoded fake secret
- Unsafe SQL string construction
- Command execution from user input
- Path traversal from user input
- Permissive CORS/security configuration
- Explicit auth bypass flag
- Unvalidated request body write
- Missing fixture tests

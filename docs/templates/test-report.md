# ACG Test Report

**Generated:** {{timestamp}}

---

## Summary

- **Passed:** {{passed}}
- **Failed:** {{failed}}
- **Skipped:** {{skipped}}
- **Duration:** {{duration}}ms

---

## Results

{{#each suites}}
### {{name}}

{{#each tests}}
- {{status}} {{name}}
{{/each}}

{{/each}}

{{#if errors}}
## Errors

{{#each errors}}
### {{suite}} / {{test}}

```
{{error}}
```

{{/each}}
{{/if}}

---

*ACG - Quality code, transparent AI, human-centered design.*

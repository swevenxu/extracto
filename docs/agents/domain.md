# Domain documentation

This repository uses a single-context layout.

## Before exploring

Read the root `GLOSSARY.md` when it exists. Also read relevant decisions under
`docs/adr/` before changing an area covered by those decisions.

If a needed concept is not defined in the glossary, treat that as a signal to
record the vocabulary gap through the domain-modeling workflow rather than
silently inventing competing terminology.

If a proposed change conflicts with an existing ADR, call out the conflict
explicitly and decide whether the ADR should be reopened.

## Layout

```text
/
├── GLOSSARY.md
└── docs/
    ├── adr/
    └── agents/
```

Glossaries and ADRs are created lazily when the project resolves domain terms
or architectural decisions; their absence is not itself a setup problem.

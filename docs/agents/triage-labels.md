# Triage labels

The skills use these canonical triage roles. Each role maps directly to the
same GitHub label string:

| Canonical role | GitHub label | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | `needs-info` | Waiting on the reporter for more information |
| `ready-for-agent` | `ready-for-agent` | Fully specified and ready for an agent |
| `ready-for-human` | `ready-for-human` | Requires human implementation |
| `wontfix` | `wontfix` | Will not be actioned |

Create any missing labels in GitHub before using triage workflows. The `gh`
CLI was unavailable during setup, so label creation remains a manual setup
step until `gh` is installed and authenticated.

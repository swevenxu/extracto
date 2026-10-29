"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkspaceMemberView, WorkspaceRole } from "@/lib/types";

interface WorkspaceSummary {
  id: string;
  name: string;
  role: WorkspaceRole;
  memberCount: number;
}

export function WorkspaceSettings() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [active, setActive] = useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberView[]>([]);
  const [newName, setNewName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const apply = useCallback((data: { workspace?: WorkspaceSummary; workspaces?: WorkspaceSummary[]; members?: WorkspaceMemberView[] }) => {
    if (data.workspace) setActive(data.workspace);
    if (data.workspaces) setWorkspaces(data.workspaces);
    if (data.members) setMembers(data.members);
  }, []);

  const request = useCallback(async () => {
    const res = await fetch("/api/workspaces");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load workspaces");
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    request()
      .then((data) => { if (!cancelled) apply(data); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load workspaces"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apply, request]);

  async function reload() {
    try { apply(await request()); } catch { /* keep the current view */ }
  }

  async function switchTo(workspaceId: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/workspaces/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not switch workspace");
      setMessage(`Now working in “${data.workspace.name}”.`);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not switch workspace"); }
    finally { setBusy(false); }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create workspace");
      setNewName("");
      setMessage(`Created “${data.workspace.name}”. You are now working in it.`);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create workspace"); }
    finally { setBusy(false); }
  }

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/workspaces/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add reviewer");
      setEmail("");
      setMessage("Reviewer added.");
      apply(data);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add reviewer"); }
    finally { setBusy(false); }
  }

  async function removeMember(member: WorkspaceMemberView) {
    if (!window.confirm(`Remove ${member.name} from this workspace?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/workspaces/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", userId: member.userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove reviewer");
      setMessage(`${member.name} removed.`);
      apply(data);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove reviewer"); }
    finally { setBusy(false); }
  }

  const isOwner = active?.role === "owner";

  return (
    <section className="surface grid gap-5 p-5" aria-labelledby="workspace-heading">
      <div>
        <h2 id="workspace-heading">Workspaces</h2>
        <p className="mt-1 text-sm text-muted">Documents, assignments and history are shared with everyone in the active workspace.</p>
      </div>

      {message && <p role="status" className="text-sm text-ink-2">{message}</p>}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {loading && <p className="text-sm text-muted" aria-busy="true">Loading workspaces…</p>}

      {!loading && (
        <ul className="grid gap-2">
          {workspaces.map((workspace) => {
            const isActive = workspace.id === active?.id;
            return (
              <li key={workspace.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    {workspace.name}
                    {isActive && <span className="status-chip" data-status="reviewed">Active</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {workspace.memberCount} {workspace.memberCount === 1 ? "member" : "members"}. You are {workspace.role === "owner" ? "an owner" : "a reviewer"}.
                  </p>
                </div>
                {!isActive && (
                  <button type="button" className="btn-quiet" onClick={() => switchTo(workspace.id)} disabled={busy}>
                    Switch
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form className="flex flex-wrap items-end gap-2 border-t border-rule pt-4" onSubmit={create}>
        <label className="grid min-w-0 flex-1 gap-1">
          <span className="field-label">New workspace</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={60}
            placeholder="Finance team"
            className="field-control"
            required
          />
        </label>
        <button type="submit" className="btn-secondary" disabled={busy || !newName.trim()}>Create workspace</button>
      </form>

      {active && (
        <div className="grid gap-3 border-t border-rule pt-4">
          <div className="section-heading">
            <h3 className="text-md font-medium text-ink">Reviewers in “{active.name}”</h3>
            <span className="text-xs text-muted">{members.length} of the workspace</span>
          </div>
          <ul className="grid gap-2">
            {members.map((member) => (
              <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{member.name}</p>
                  <p className="text-xs text-muted">{member.email || "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="status-chip">{member.role}</span>
                  {isOwner && member.role !== "owner" && (
                    <button type="button" className="btn-quiet text-error hover:bg-error/10" onClick={() => removeMember(member)} disabled={busy}>
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {isOwner ? (
            <form className="flex flex-wrap items-end gap-2" onSubmit={addMember}>
              <label className="grid min-w-0 flex-1 gap-1">
                <span className="field-label">Add reviewer by email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  className="field-control"
                  required
                />
              </label>
              <button type="submit" className="btn-secondary" disabled={busy || !email.trim()}>Add reviewer</button>
            </form>
          ) : (
            <p className="text-xs text-muted">Only workspace owners can add or remove reviewers.</p>
          )}
        </div>
      )}
    </section>
  );
}

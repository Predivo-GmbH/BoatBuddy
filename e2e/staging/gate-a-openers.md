# Gate A: verified-safe openers

`gate-a.config.ts` overrides the destructive denylist for one pattern: an accessible name
ending in **"löschen"**. That override is the difference between measuring this app's shared
`ConfirmDialog` and never opening it at all, so it does not rest on a guess.

**The claim:** in this app, a delete *trigger* never deletes anything. It sets a piece of React
state, which renders `ConfirmDialog`. The actual deletion lives in that dialog's `onConfirm`,
and `onConfirm` is a commit control, which Gate A **measures and never clicks**.

**The evidence, every delete trigger in the app, read 2026-08-21:**

| File | Line | Trigger | What it does |
|---|---|---|---|
| `src/components/finanzen/AusgabenTabelle.tsx` | 235 | `${a.bezeichnung} löschen` | `onClick={() => setDeleteId(a.id)}` |
| `src/components/gastsessions/GastsessionTabelle.tsx` | 267 | `${s.gast_name} löschen` | `onClick={() => setDeleteId(s.id)}` |
| `src/components/kalender/ReservierungDialog.tsx` | 247 | `${FAHRER_LABELS[r.fahrer]} Reservierung löschen` | `onClick={() => setDeleteId(r.id)}` |
| `src/components/nutzung/NutzungslogTabelle.tsx` | 221 | `${formatDate(log.datum)} löschen` | `onClick={() => setDeleteId(log.id)}` |
| `src/pages/BootPage.tsx` | 605 | `${w.bezeichnung} löschen` | `onClick={() => setDeleteId(w.id)}` |
| `src/pages/BootPage.tsx` | 641 | `${w.bezeichnung} löschen` | `onClick={() => setDeleteId(w.id)}` |
| `src/pages/BootPage.tsx` | 765 | `Regel ${idx + 1} löschen` | `onClick={() => setDeleteId(r.id)}` |
| `src/pages/NeuigkeitenPage.tsx` | 326 | `Eintrag löschen` | `onClick={() => setDeleteId(entry.id)}` |

Eight triggers, eight pure state setters, zero mutations. The mutation is always
`deleteX.mutate(deleteId)` inside `ConfirmDialog`'s `onConfirm`, for example
`AusgabenTabelle.tsx:252`.

**What keeps this honest as the app changes:** if someone ever wires a delete button straight to
a mutation, this override becomes dangerous. That is why the table above carries file and line
rather than a summary: re-read it whenever the crawl reports a new `* löschen` trigger, and
whenever this list changes, change the override with it.

**Not overridden, and deliberately so:** `export`, `import`, `download`, `hochladen`, `senden`,
`teilen`, `bezahl`, `checkout`, and sign-out. Those either leave the app or move data, and
nothing is learned by clicking them that is worth the risk.

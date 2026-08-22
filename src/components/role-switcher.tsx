"use client";

import { setActiveUser } from "@/src/actions/session";
import { ROLE_LABELS } from "@/src/types/itil";
import type { Role } from "@/app/generated/prisma/enums";

// This file starts with "use client" — the opposite of every component
// we've written so far. It means this component's code is bundled and
// shipped to the browser, and runs there. We need that here because
// `onChange` is a browser event: something has to be sitting in the
// browser listening for it. A plain Server Component *cannot* have an
// onChange handler at all — it never runs in the browser in the first
// place, so there'd be nothing to attach the listener to.
//
// Notice the form's `action` still points at `setActiveUser`, the Server
// Action from src/actions/session.ts. Client Components can still hand
// off the actual work (touching cookies, the database) to server code —
// we're only running the tiny "which option got picked" logic here.

type SwitcherUser = {
  id: string;
  name: string;
  role: Role;
};

export function RoleSwitcher({
  users,
  activeUserId,
}: {
  users: SwitcherUser[];
  activeUserId: string | null;
}) {
  return (
    <form action={setActiveUser} className="flex items-center gap-2 text-sm">
      <label htmlFor="userId" className="text-zinc-500 dark:text-zinc-400">
        Viewing as:
      </label>
      <select
        id="userId"
        name="userId"
        defaultValue={activeUserId ?? ""}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="rounded border border-black/10 bg-white px-2 py-1 dark:border-white/10 dark:bg-zinc-900"
      >
        <option value="" disabled>
          Select a user…
        </option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} — {ROLE_LABELS[user.role]}
          </option>
        ))}
      </select>
    </form>
  );
}

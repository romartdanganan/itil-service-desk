"use client";

import { useFormStatus } from "react-dom";

// The one bit of client-side interactivity this needs: `useFormStatus`
// only works in a component rendered *inside* the form it's reporting
// on, and only as a Client Component (it's a hook). Everything else
// about this app's forms stays plain server-rendered HTML, this is a
// narrow, deliberate exception for actions slow enough that "did my
// click actually register" becomes a real question, like a call to an
// LLM that can take a couple of seconds. See src/components/login-form.tsx
// for the same "small client component just for the interactive bit"
// pattern already used elsewhere.
export function SubmitButton({
  children,
  pendingText,
  className,
}: {
  children: React.ReactNode;
  pendingText: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}

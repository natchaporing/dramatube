"use client";

import { startTransition } from "react";

/**
 * Submit a form to a Server Action without React resetting it afterwards.
 *
 * React 19 clears a `<form action={…}>` after every submission, which is right
 * on success and wrong on failure: a "that handle is taken" answer would also
 * throw away the description somebody spent ten minutes writing. Dispatching
 * from `onSubmit` keeps every field as it was; forms that want a reset on
 * success do it themselves.
 */
export function keepFields(dispatch: (data: FormData) => void) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  };
}

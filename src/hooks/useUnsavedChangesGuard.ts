import { useState } from "react";

/** Intercepts a dialog's close attempts (backdrop click, Escape, Cancel button) when there
 *  are unsaved changes, so the user must explicitly confirm discarding them rather than
 *  losing in-progress work by clicking outside the dialog. Pass this hook's
 *  `guardedOnOpenChange` to the Dialog instead of the real `onOpenChange`, and render
 *  `<UnsavedChangesAlert />` (or the shared component) using the returned state. */
export function useUnsavedChangesGuard(isDirty: boolean, onOpenChange: (open: boolean) => void) {
  const [pendingClose, setPendingClose] = useState(false);

  const guardedOnOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isDirty) {
      setPendingClose(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const confirmDiscard = () => {
    setPendingClose(false);
    onOpenChange(false);
  };

  const cancelDiscard = () => setPendingClose(false);

  return { guardedOnOpenChange, pendingClose, confirmDiscard, cancelDiscard };
}

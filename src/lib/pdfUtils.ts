/**
 * Convert a base64-encoded PDF string into an in-browser blob URL, suitable
 * for an <iframe> preview or a download link. Caller is responsible for
 * revoking the URL (URL.revokeObjectURL) once it's no longer shown.
 */
export const base64ToPdfBlobUrl = (base64: string): string => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: "application/pdf" });
  return URL.createObjectURL(blob);
};

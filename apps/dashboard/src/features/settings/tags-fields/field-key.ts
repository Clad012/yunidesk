/** Same rule as the server: lowercase letters, digits and _, starting with a letter, up to 40. */
export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/** Suggests a key from a label: "Numéro de commande" → "numero_de_commande". */
export function fieldKeyFromLabel(label: string): string {
  let key = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (key && !/^[a-z]/.test(key)) key = `f_${key}`;
  return key.slice(0, 40).replace(/_+$/, "");
}

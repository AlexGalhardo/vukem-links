type ClassValue = string | false | null | undefined;

// cn joins class names, skipping falsy values (the shadcn/ui helper, without
// the clsx and tailwind-merge dependencies: components never pass conflicting utilities).
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}

const number = new Intl.NumberFormat("pt-BR");

export const fmt = (value: number): string => number.format(value);

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export const formatDateTime = (value: string): string => dateTime.format(new Date(value));

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "nunca";
  const hours = Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000);
  if (hours < 1) return "agora";
  return hours < 24 ? `há ${hours}h` : `há ${Math.floor(hours / 24)}d`;
}

export const redirectUrl = (externalId: string): string =>
  `${window.location.origin}/link?id=${encodeURIComponent(externalId)}`;

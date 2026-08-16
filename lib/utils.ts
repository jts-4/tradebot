export const TZ = 'Europe/Istanbul'

export function toIST(utc: string | Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(utc))
}

export function toISTTime(utc: string | Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: TZ,
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(utc))
}

export function ageMinutes(utc: string | Date): number {
  return Math.floor((Date.now() - new Date(utc).getTime()) / 60000)
}

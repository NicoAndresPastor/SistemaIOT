export function formatearTiempoRelativo(fechaIso: string | null): string {
  if (!fechaIso) return 'nunca';

  const diffMs = Date.now() - new Date(fechaIso).getTime();
  const segundos = Math.floor(diffMs / 1000);
  if (segundos < 60) return 'hace un momento';

  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;

  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

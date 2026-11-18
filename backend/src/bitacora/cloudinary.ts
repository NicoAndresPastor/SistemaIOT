import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export function subirImagen(buffer: Buffer): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'bitacora' },
      (error, resultado) => {
        if (error || !resultado) {
          reject(error ?? new Error('No se pudo subir la imagen'));
          return;
        }
        resolve({ url: resultado.secure_url, publicId: resultado.public_id });
      }
    );
    stream.end(buffer);
  });
}

export function borrarImagen(publicId: string): Promise<void> {
  return cloudinary.uploader.destroy(publicId).then(() => undefined);
}

// La tabla imagen solo guarda la URL (ruta_archivo), no el public_id por
// separado. Para borrar en Cloudinary hace falta reconstruirlo a partir de
// la URL, que siempre tiene la forma .../upload/v<version>/<public_id>.<ext>
export function publicIdDesdeUrl(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
  return match ? match[1] : null;
}

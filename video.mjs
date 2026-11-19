export const videoBucket = 'phuketliving2-videos';
export const maxVideoBytes = 50_000_000;
const uuid = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const videoPath = new RegExp(`^${uuid}/${uuid}\\.mp4$`);

export function validVideoPath(path, id) {
  return typeof path === 'string' && videoPath.test(path) && (!id || path.startsWith(`${id}/`));
}

export function listingVideoUrl(property) {
  return validVideoPath(property.video_path, property.id) ? `/videos/${property.video_path}` : '';
}

export function validateVideoFile(file) {
  if (!(file instanceof Blob) || !/\.mp4$/i.test(file.name) || (file.type && file.type !== 'video/mp4')) {
    throw Error('Choose an MP4 video. H.264 works on most phones and browsers.');
  }
  if (!file.size || file.size > maxVideoBytes) throw Error('Choose an MP4 video up to 50 MB.');
}

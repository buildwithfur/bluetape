const THUMBNAIL_MAX_EDGE = 640
const THUMBNAIL_QUALITY = 0.8

/**
 * Create a small JPEG derivative for catalog cards. Browsers generally apply
 * the source image's EXIF orientation when decoding an <img>, so drawing the
 * decoded image preserves the orientation users see on their phones.
 *
 * If the browser cannot decode the selected format (for example an HEIC file
 * on an unsupported browser), return null and let the caller fall back to the
 * original upload.
 */
export async function createPhotoThumbnail(file: Blob): Promise<Blob | null> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return null

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const sourceWidth = image.naturalWidth
    const sourceHeight = image.naturalHeight
    if (!sourceWidth || !sourceHeight) return null

    const scale = Math.min(
      1,
      THUMBNAIL_MAX_EDGE / Math.max(sourceWidth, sourceHeight),
    )
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, width, height)

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', THUMBNAIL_QUALITY)
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to decode image'))
    image.src = src
  })
}
